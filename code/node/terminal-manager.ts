import path from 'node:path'
import * as pty from 'node-pty'
import { createId } from '@/base/ids'
import type {
  TerminalEvent,
  TerminalRequest,
} from '@/base/protocol'
import type { ID, Slab } from '@/base/types'
import { expandHome } from './paths'
import { getDefaultShell } from './shell'

export type TerminalManagerOptions = {
  emit(event: TerminalEvent): void
}

type RuntimeSlab = {
  slab: Slab
  pty: pty.IPty
  outputBuffer: string[]
  createdAt: number
}

export class TerminalManager {
  private slabs = new Map<ID, RuntimeSlab>()

  constructor(private options: TerminalManagerOptions) {}

  async handle(request: TerminalRequest): Promise<unknown> {
    switch (request.type) {
      case 'slab:create':
        return this.createSlab(request.payload)
      case 'slab:write':
        return this.write(request.payload.slabId, request.payload.data)
      case 'slab:resize':
        return this.resize(
          request.payload.slabId,
          request.payload.cols,
          request.payload.rows,
        )
      case 'slab:kill':
        return this.kill(request.payload.slabId)
      case 'slab:restart':
        return this.restart(request.payload.slabId)
      case 'workspace:create':
      case 'workspace:open':
      case 'workspace:list':
        throw new Error(
          `Workspace store not wired into manager: ${request.type}`,
        )
      default:
        assertNever(request)
    }
  }

  async createSlab(input: {
    workspaceId: ID
    tabId: ID
    name?: string
    cwd?: string
    shell?: string
    args?: string[]
    command?: string
    env?: Record<string, string>
    cols: number
    rows: number
  }): Promise<Slab> {
    const id = createId('slab')
    const shell = input.shell ?? getDefaultShell()
    const cwd = expandHome(input.cwd ?? process.cwd())

    const slab: Slab = {
      id,
      workspaceId: input.workspaceId,
      tabId: input.tabId,
      name: input.name ?? path.basename(cwd),
      cwd,
      shell,
      args: input.args ?? [],
      command: input.command,
      env: input.env,
      cols: input.cols,
      rows: input.rows,
      status: 'starting',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }

    this.emitStatus(id, 'starting')

    const proc = pty.spawn(shell, input.args ?? [], {
      name: 'xterm-256color',
      cols: input.cols,
      rows: input.rows,
      cwd,
      env: {
        ...process.env,
        TERM: 'xterm-256color',
        COLORTERM: 'truecolor',
        TERM_PROGRAM: 'cluesurf-rock',
        ...input.env,
      } as Record<string, string>,
    })

    const runtime: RuntimeSlab = {
      slab,
      pty: proc,
      outputBuffer: [],
      createdAt: Date.now(),
    }
    this.slabs.set(id, runtime)

    proc.onData(data => {
      runtime.outputBuffer.push(data)
      if (runtime.outputBuffer.length > 5000) {
        runtime.outputBuffer.splice(0, runtime.outputBuffer.length - 5000)
      }
      this.options.emit({
        type: 'slab:data',
        payload: {
          slabId: id,
          data,
        },
      })
    })

    proc.onExit(event => {
      slab.status = 'exited'
      slab.updatedAt = Date.now()
      this.options.emit({
        type: 'slab:exit',
        payload: {
          slabId: id,
          exitCode: event.exitCode,
          signal: event.signal,
        },
      })
      this.emitStatus(id, 'exited')
    })

    slab.status = 'running'
    this.emitStatus(id, 'running')

    if (input.command) {
      proc.write(`${input.command}\r`)
    }

    return slab
  }

  write(slabId: ID, data: string): null {
    const runtime = this.mustGetSlab(slabId)
    runtime.pty.write(data)
    return null
  }

  resize(slabId: ID, cols: number, rows: number): null {
    const runtime = this.mustGetSlab(slabId)
    const safeCols = Math.max(2, Math.floor(cols))
    const safeRows = Math.max(1, Math.floor(rows))
    runtime.slab.cols = safeCols
    runtime.slab.rows = safeRows
    runtime.slab.updatedAt = Date.now()
    runtime.pty.resize(safeCols, safeRows)
    return null
  }

  kill(slabId: ID): null {
    const runtime = this.mustGetSlab(slabId)
    runtime.pty.kill()
    this.slabs.delete(slabId)
    return null
  }

  async restart(slabId: ID): Promise<Slab> {
    const runtime = this.mustGetSlab(slabId)
    const slab = runtime.slab
    runtime.pty.kill()
    this.slabs.delete(slabId)

    return this.createSlab({
      workspaceId: slab.workspaceId,
      tabId: slab.tabId,
      name: slab.name,
      cwd: slab.cwd,
      shell: slab.shell,
      args: slab.args,
      command: slab.command,
      env: slab.env,
      cols: slab.cols,
      rows: slab.rows,
    })
  }

  async shutdown(): Promise<void> {
    for (const runtime of this.slabs.values()) {
      runtime.pty.kill()
    }
    this.slabs.clear()
  }

  getOutputBuffer(slabId: ID): string[] {
    return [...this.mustGetSlab(slabId).outputBuffer]
  }

  listSlabs(): Slab[] {
    return [...this.slabs.values()].map(runtime => runtime.slab)
  }

  private mustGetSlab(slabId: ID): RuntimeSlab {
    const runtime = this.slabs.get(slabId)
    if (!runtime) {
      throw new Error(`Slab not found: ${slabId}`)
    }
    return runtime
  }

  private emitStatus(slabId: ID, status: Slab['status']): void {
    this.options.emit({
      type: 'slab:status',
      payload: {
        slabId,
        status,
      },
    })
  }
}

function assertNever(value: never): never {
  throw new Error(`Unhandled request: ${JSON.stringify(value)}`)
}

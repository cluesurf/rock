import path from 'node:path'
import * as pty from 'node-pty'
import { createId } from '@/base/ids'
import type {
  TerminalEvent,
  TerminalRequest,
} from '@/base/protocol'
import type { ID, Slab } from '@/base/types'
import { expandHome } from './paths'
import { getDefaultProgram } from './program'

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
    /** Pre-generated slab id from compileWorkspace. When the
     *  caller compiled a workspace and sent slabIdByName to
     *  the renderer, the same id MUST be used here so reads
     *  / writes from the renderer match the runtime slab. */
    id?: ID
    workspaceId: ID
    tabId: ID
    name?: string
    cwd?: string
    program?: string
    args?: string[]
    command?: string
    env?: Record<string, string>
    cols: number
    rows: number
  }): Promise<Slab> {
    const id = input.id ?? createId('slab')
    // Treat empty string AND undefined as "use default shell"
    // — compileWorkspace sets program to '' when the user
    // didn't specify one. pty.spawn('') would silently do
    // nothing (no shell ever starts, xterm sits empty).
    const program =
      input.program && input.program.length > 0
        ? input.program
        : getDefaultProgram()
    const cwd = expandHome(input.cwd ?? process.cwd())

    const slab: Slab = {
      id,
      workspaceId: input.workspaceId,
      tabId: input.tabId,
      name: input.name ?? path.basename(cwd),
      cwd,
      program,
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

    const proc = pty.spawn(program, input.args ?? [], {
      name: 'xterm-256color',
      cols: input.cols,
      rows: input.rows,
      cwd,
      env: {
        ...process.env,
        TERM: 'xterm-256color',
        COLORTERM: 'truecolor',
        TERM_PROGRAM: 'cluesurf-rock',
        // Disable zsh's "partial line" indicator. zsh
        // prints a highlighted `%` and inserts a newline
        // whenever the previous output didn't end in \n —
        // e.g. when xterm sends its initial resize before
        // the first prompt fires, or when an OSC reply
        // doesn't include a trailing newline. Cosmetic
        // glitch only, but it pushes the first prompt
        // onto line 2, which the user reads as "the
        // cursor went to the wrong place". Setting an
        // empty mark suppresses both the % and the
        // forced newline.
        PROMPT_EOL_MARK: '',
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

    // OSC 7 init hook. zsh + bash don't emit OSC 7 by
    // default, so without this Rock would never receive
    // cwd-change notifications and the persisted cwd for
    // every tab would be the initial spawn cwd forever
    // (defeats "reopen each tab where I was").
    //
    // The hook is a one-liner that defines a tiny print
    // function + registers it with the shell's chpwd /
    // PROMPT_COMMAND hook, then fires once to capture
    // the initial state. Trailing `clear` wipes the
    // setup so the user never sees it.
    //
    // Other shells (fish, nu, etc.) silently no-op this
    // line — they'll get the initial-cwd-only behavior,
    // still better than nothing.
    const osc7Hook =
      `_rock_cwd(){ printf '\\033]7;file://%s%s\\a' "${'${HOSTNAME:-${HOST}}'}" "$PWD"; };` +
      ` if [ -n "$ZSH_VERSION" ]; then chpwd_functions+=(_rock_cwd) 2>/dev/null;` +
      ` elif [ -n "$BASH_VERSION" ]; then PROMPT_COMMAND="_rock_cwd;${'${PROMPT_COMMAND:-}'}"; fi;` +
      ` _rock_cwd; clear`
    proc.write(`${osc7Hook}\r`)

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
      program: slab.program,
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

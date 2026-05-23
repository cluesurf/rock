import { createId } from './ids'
import { makeEvenSplit } from './layout'
import type { WorkspaceDefinition } from './define'
import type { Slab, Workspace } from './types'

export type CompiledWorkspace = {
  workspace: Workspace
  slabs: Slab[]
  /** Map from symbolic slab name (e.g., 'web') to compiled slab ID. */
  slabIdByName: Record<string, string>
}

/**
 * Convert a user-facing WorkspaceDefinition (slabs as a
 * named map) into the internal Workspace + Slab[] shape
 * the runtime uses.
 *
 * The compiler synthesizes a single default tab containing
 * every slab. The user can override the visual arrangement
 * via `.rock/layout.tsx` (JSX) which is rendered separately
 * from this internal model.
 */
export function compileWorkspace(
  input: WorkspaceDefinition,
): CompiledWorkspace {
  const workspaceId = createId('workspace')
  const tabId = createId('tab')
  const now = Date.now()
  const root = input.root ?? process.cwd()

  const slabEntries = Object.entries(input.slabs)
  if (slabEntries.length === 0) {
    throw new Error(
      `Workspace '${input.name}' has no slabs. Add at least one entry to the slabs map.`,
    )
  }

  const slabs: Slab[] = []
  const slabIdByName: Record<string, string> = {}

  for (const [name, slabInput] of slabEntries) {
    const id = createId('slab')
    slabIdByName[name] = id
    slabs.push({
      id,
      workspaceId,
      tabId,
      name,
      cwd: slabInput.cwd ?? root,
      program: slabInput.program ?? '',
      args: slabInput.args ?? [],
      command: slabInput.command,
      env: { ...input.env, ...slabInput.env },
      cols: 80,
      rows: 24,
      status: 'idle',
      createdAt: now,
      updatedAt: now,
    })
  }

  const defaultLayout = makeEvenSplit(slabs.map(slab => slab.id))

  const tab = {
    id: tabId,
    workspaceId,
    name: input.name,
    root,
    layout: defaultLayout,
  }

  const workspace: Workspace = {
    id: workspaceId,
    name: input.name,
    root,
    tabs: [tab],
    layout: defaultLayout,
    createdAt: now,
    updatedAt: now,
  }

  return { workspace, slabs, slabIdByName }
}

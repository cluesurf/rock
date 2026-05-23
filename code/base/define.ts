/**
 * v1 public API — the simple shape.
 *
 * Per the v1 simplicity directive: slabs are a NAMED MAP
 * (not arrays of objects with synthetic ids), layout is
 * JSX (in `.rock/layout.tsx`), sidebar is JSX (in
 * `.rock/sidebar.tsx`). Plugins / discovery / graph
 * abstractions are Phase 2 and live in their own modules.
 *
 *     // .term/workspace.ts
 *     import { defineWorkspace } from '@cluesurf/rock'
 *
 *     export default defineWorkspace({
 *       name: 'clue',
 *       slabs: {
 *         web: { cwd: './site', command: 'pnpm dev' },
 *         api: { cwd: './base', command: 'pnpm dev' },
 *         logs: { command: 'tail -f logs/app.log' },
 *       },
 *     })
 */

export type WorkspaceDefinition = {
  name: string

  /**
   * Project root. If omitted, the runtime uses the
   * directory that contains the `.rock/` folder.
   */
  root?: string

  /**
   * Named slab definitions. The key becomes the slab's
   * symbolic name (referenced in layout + sidebar JSX).
   */
  slabs: Record<string, SlabDefinition>

  /**
   * Workspace-wide environment applied to every slab.
   * Per-slab env merges on top.
   */
  env?: Record<string, string>

  /**
   * Optional theme name. Looked up against built-in
   * + project theme registry.
   */
  theme?: string
}

export type SlabDefinition = {
  cwd?: string
  command?: string
  program?: string
  args?: string[]
  env?: Record<string, string>
}

/**
 * Identity helper. Gives type inference + IDE
 * autocomplete to a `.rock/workspace.ts` export.
 *
 *     export default workspace({
 *       name: 'my-app',
 *       slabs: { web: { command: 'pnpm dev' } },
 *     })
 */
export function workspace<T extends WorkspaceDefinition>(input: T): T {
  return input
}

/** @deprecated Use `workspace` instead. */
export const defineWorkspace = workspace

/**
 * Named command map for `.rock/commands.ts`. Run via
 * `rock run <name>` or the in-app command palette.
 *
 *     // .term/commands.ts
 *     import { defineCommands } from '@cluesurf/rock'
 *
 *     export default defineCommands({
 *       deploy: { command: 'pnpm deploy', cwd: './ops' },
 *       migrate: { command: 'pnpm migrate', cwd: './base' },
 *     })
 */
export function commands<T extends Record<string, CommandDefinition>>(
  input: T,
): T {
  return input
}

/** @deprecated Use `commands` instead. */
export const defineCommands = commands

export type CommandDefinition = {
  command: string
  cwd?: string
  env?: Record<string, string>
  description?: string
}

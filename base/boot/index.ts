/**
 * Rock.app entry point.
 *
 * Rock is a host shell. Per-project customization lives in
 * `.rock/` next to the user's code:
 *
 *   .rock/workspace.ts   the slabs to spawn
 *   .rock/layout.tsx     the React layout (JIT-compiled)
 *   .rock/sidebar.tsx    the sidebar (JIT-compiled)
 *
 * When launched without a project, falls back to a default
 * workspace (zsh + a few helpers) so the app is usable
 * out of the box.
 */

import { argv, cwd, env } from 'node:process'
import {
  findRockFolders,
  loadRockFolder,
} from '@cluesurf/rock/node'
import { bundleUserModule } from '@cluesurf/rock/node'
import { workspace, type WorkspaceDefinition } from '@cluesurf/rock'
import { boot } from '@cluesurf/rock/boot'

function projectRootFromArgv(): string {
  // Allow the `rock` CLI to pass `--cwd=/path/to/project`
  // so the .app can find the user's .rock/ folder.
  const arg = argv.find(a => a.startsWith('--cwd='))
  if (arg) return arg.slice('--cwd='.length)
  return env.ROCK_CWD ?? cwd()
}

function defaultWorkspace(): WorkspaceDefinition {
  return workspace({
    name: 'rock',
    slabs: {
      term: { command: env.SHELL ?? 'zsh' },
    },
  })
}

async function main() {
  const startCwd = projectRootFromArgv()
  const folders = findRockFolders(startCwd)
  const folderPath = folders.projectRoot ?? folders.globalRoot

  let chosenWorkspace: WorkspaceDefinition = defaultWorkspace()
  const userBundles: Record<string, string> = {}

  try {
    const loaded = await loadRockFolder(folderPath)
    if (loaded.workspace) {
      chosenWorkspace = loaded.workspace
    }

    // JIT-bundle every user .tsx Rock knows about.
    const candidates: Array<[string, string]> = [
      ['layout.js', `${folderPath}/layout.tsx`],
      ['sidebar.js', `${folderPath}/sidebar.tsx`],
    ]
    for (const [key, entry] of candidates) {
      const result = await bundleUserModule(entry)
      if (result) userBundles[key] = result.code
    }
  } catch (error) {
    console.warn(
      `[rock] couldn't load .rock/ at ${folderPath}:`,
      error instanceof Error ? error.message : error,
    )
  }

  await boot({
    name: 'Rock',
    workspace: chosenWorkspace,
    userBundles,
  })
}

void main()

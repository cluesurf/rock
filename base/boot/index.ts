/**
 * Rock.app entry point.
 *
 * Rock is a host shell. Per-project customization lives in
 * `<projectRoot>/.rock/code/index.ts`. That file is the
 * SINGLE entry point — JIT-bundled by esbuild and loaded
 * into the renderer. Whatever it default-exports is the
 * user's app:
 *
 *     // .rock/code/index.ts
 *     import Layout from './layout'
 *     import Sidebar from './sidebar'
 *
 *     export default {
 *       workspace: { name: 'foo', slabs: {...} },
 *       Layout,
 *       Sidebar,
 *       commands: {...},
 *     }
 *
 * Internally the user can split into as many files as they
 * want; only `code/index.ts` is contractual.
 *
 * When launched without a project, falls back to a default
 * workspace + the built-in sidebar tree.
 */

import { argv, cwd, env } from 'node:process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import {
  findRockFolders,
  loadRockFolder,
  bundleUserModuleCached,
  recordRecentProject,
  mostRecentProject,
} from '@cluesurf/rock/node'
import { workspace, type WorkspaceDefinition } from '@cluesurf/rock'
import { boot } from '@cluesurf/rock/boot'

function projectRootFromArgv(): string {
  // Allow the `rock` CLI to pass `--cwd=/path/to/project`
  // so the .app can find the user's .rock/ folder.
  const arg = argv.find(a => a.startsWith('--cwd='))
  if (arg) return arg.slice('--cwd='.length)
  if (env.ROCK_CWD) return env.ROCK_CWD
  // Bare launch (open -a Rock from Finder, no cwd hint) →
  // fall back to the most-recently-opened project. That
  // turns "open Rock from the Dock" into "reopen what I
  // had last time". Skipped when the user explicitly
  // chose a different cwd above.
  const recent = mostRecentProject()
  if (recent) return recent
  return cwd()
}

function defaultWorkspace(): WorkspaceDefinition {
  // No `program` / `command` here — TerminalManager picks the
  // OS default shell via getDefaultProgram(). `command` is for
  // typing something INTO the shell after it starts (e.g.
  // `command: 'tail -f log.txt'`), NOT the shell binary itself.
  return workspace({
    name: 'rock',
    slabs: {
      term: {},
    },
  })
}

/** Resolve `.rock/code/index.{tsx,ts}` if present. */
function findUserEntry(rockFolder: string): string | null {
  for (const name of ['code/index.tsx', 'code/index.ts']) {
    const p = join(rockFolder, name)
    if (existsSync(p)) return p
  }
  return null
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

    // JIT-bundle the single user entry point. Uses a cache
    // at <rockFolder>/.cache/ so subsequent launches with
    // unchanged user code skip esbuild entirely (~30-400ms
    // savings depending on bundle complexity).
    const entry = findUserEntry(folderPath)
    if (entry) {
      const code = await bundleUserModuleCached(folderPath, entry)
      if (code) userBundles['app.js'] = code
    }

    // Record this project in the recents registry so the
    // next bare launch can reopen it by default.
    if (folders.projectRoot) {
      recordRecentProject(folders.projectRoot)
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

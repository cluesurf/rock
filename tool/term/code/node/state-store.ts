/**
 * Per-project state persistence — two-file layered model.
 *
 *   <projectRoot>/.tool/term/base.json        Committed. Shared
 *                                        baseline layout for
 *                                        the project — the
 *                                        author's intended
 *                                        default sidebar tree
 *                                        + workspace.
 *
 *   <projectRoot>/.tool/term/base.local.json  Gitignored. This
 *                                        machine's state —
 *                                        window position,
 *                                        last-known cwds,
 *                                        per-user tab order
 *                                        and labels.
 *
 * Loading merges the two: `base.local.json` overrides
 * `base.json` field by field. Saving writes ONLY to
 * `base.local.json` — `base.json` is hand-curated by the
 * author and never auto-written.
 *
 * The first save automatically adds `base.local.json` to
 * `.tool/term/.gitignore`. `base.json` is intentionally NOT
 * gitignored; the author commits it as the project's
 * default Term layout.
 */

import {
  existsSync,
  readFileSync,
  writeFileSync,
  renameSync,
  mkdirSync,
} from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import type { TreeNode } from '@/base/tree'

export type WindowState = {
  tabs: TabState[]
  activeIndex: number
  position?: { x: number; y: number; width: number; height: number }
  /** Display structure for the sidebar. If null/undefined,
   *  the consumer should fall back to flat (one leaf per tab). */
  tree?: TreeNode[]
}

export type TabState = {
  name: string
  label?: string
  cwd?: string
}

export type ProjectState = {
  version: 1
  windows: WindowState[]
}

const FILE_BASE = 'base.json'
const FILE_LOCAL = 'base.local.json'
const GITIGNORE = '.gitignore'

export function projectStatePath(toolFolderPath: string): string {
  return join(toolFolderPath, FILE_BASE)
}

export function projectLocalStatePath(toolFolderPath: string): string {
  return join(toolFolderPath, FILE_LOCAL)
}

/**
 * Load the effective project state — `base.json` merged
 * with per-machine overrides from `base.local.json`. If
 * neither exists, returns null.
 */
export function loadProjectState(
  toolFolderPath: string,
): ProjectState | null {
  const base = readJson(join(toolFolderPath, FILE_BASE))
  const local = readJson(join(toolFolderPath, FILE_LOCAL))
  if (!base && !local) return null
  return mergeState(base, local)
}

function readJson(filePath: string): ProjectState | null {
  if (!existsSync(filePath)) return null
  try {
    const raw = readFileSync(filePath, 'utf-8')
    const parsed = JSON.parse(raw) as ProjectState
    if (parsed.version !== 1 || !Array.isArray(parsed.windows)) {
      console.warn(`[term] state at ${filePath} is malformed; ignoring.`)
      return null
    }
    return parsed
  } catch (error) {
    console.warn(
      `[term] couldn't read ${filePath}:`,
      error instanceof Error ? error.message : error,
    )
    return null
  }
}

/**
 * Field-by-field merge: local overrides base. For each
 * window slot, local fields win where defined; missing
 * fields fall through to base.
 */
function mergeState(
  base: ProjectState | null,
  local: ProjectState | null,
): ProjectState {
  if (!base) return local ?? { version: 1, windows: [] }
  if (!local) return base
  const length = Math.max(base.windows.length, local.windows.length)
  const windows: WindowState[] = []
  for (let i = 0; i < length; i += 1) {
    const b = base.windows[i]
    const l = local.windows[i]
    if (!b) {
      if (l) windows.push(l)
      continue
    }
    if (!l) {
      windows.push(b)
      continue
    }
    windows.push({
      tabs: l.tabs ?? b.tabs,
      activeIndex: l.activeIndex ?? b.activeIndex,
      tree: l.tree ?? b.tree,
      position: l.position ?? b.position,
    })
  }
  return { version: 1, windows }
}

/**
 * Atomic write of the per-machine override file (NEVER
 * touches `base.json`). Temp file + rename so a crash mid-
 * write can't leave a half-written file.
 */
export function saveProjectState(
  toolFolderPath: string,
  state: ProjectState,
): void {
  if (!existsSync(toolFolderPath)) {
    try {
      mkdirSync(toolFolderPath, { recursive: true })
    } catch {
      return
    }
  }
  ensureGitignored(toolFolderPath)
  const file = projectLocalStatePath(toolFolderPath)
  const tmp = join(tmpdir(), `term-state-${Date.now()}-${process.pid}.json`)
  try {
    writeFileSync(tmp, JSON.stringify(state, null, 2), 'utf-8')
    renameSync(tmp, file)
  } catch (error) {
    console.warn(
      `[term] couldn't write ${file}:`,
      error instanceof Error ? error.message : error,
    )
  }
}

/**
 * Make sure `.tool/term/.gitignore` covers the per-machine files
 * (base.local.json + the bundle cache dir). `base.json` is
 * intentionally NOT gitignored — the project author commits
 * it as the shared layout.
 */
function ensureGitignored(toolFolderPath: string): void {
  const gi = join(toolFolderPath, GITIGNORE)
  const entries = [FILE_LOCAL, '.cache/']
  try {
    let current = existsSync(gi) ? readFileSync(gi, 'utf-8') : ''
    const lines = current.split(/\r?\n/)
    let changed = false
    for (const entry of entries) {
      if (!lines.includes(entry)) {
        current = current.endsWith('\n') || current.length === 0
          ? `${current}${entry}\n`
          : `${current}\n${entry}\n`
        changed = true
      }
    }
    if (changed) writeFileSync(gi, current, 'utf-8')
  } catch {
    /* best-effort */
  }
}

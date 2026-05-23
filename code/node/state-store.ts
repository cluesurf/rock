/**
 * Per-project state persistence.
 *
 * Lives at `<projectRoot>/.rock/base.json`. Stores window
 * geometry, the tab list (name + label + last-known cwd),
 * and active tab. Gitignored by default — Rock auto-adds
 * `base.json` to `.rock/.gitignore` on first save.
 *
 * Read on launch (before window creation) so we can spawn
 * shells at their last-known cwd. Written on graceful
 * shutdown, structural changes (new/close tab), rename,
 * and debounced cwd changes from OSC 7.
 *
 * Outside any project (no `.rock/` ancestor), persistence
 * is a no-op — the load returns null and save is skipped.
 */

import { existsSync, readFileSync, writeFileSync, renameSync, mkdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
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
  /** Slab name — stable id used by Dock + IPC. */
  name: string
  /** User-edited display label. Falls back to name when absent. */
  label?: string
  /** Last-known cwd. Used when respawning the shell. */
  cwd?: string
}

export type ProjectState = {
  version: 1
  windows: WindowState[]
}

const FILE = 'base.json'
const GITIGNORE = '.gitignore'

export function projectStatePath(rockFolderPath: string): string {
  return join(rockFolderPath, FILE)
}

export function loadProjectState(
  rockFolderPath: string,
): ProjectState | null {
  const file = projectStatePath(rockFolderPath)
  if (!existsSync(file)) return null
  try {
    const raw = readFileSync(file, 'utf-8')
    const parsed = JSON.parse(raw) as ProjectState
    if (parsed.version !== 1 || !Array.isArray(parsed.windows)) {
      console.warn(`[rock] state at ${file} is malformed; ignoring.`)
      return null
    }
    return parsed
  } catch (error) {
    console.warn(
      `[rock] couldn't read ${file}:`,
      error instanceof Error ? error.message : error,
    )
    return null
  }
}

/**
 * Atomic write: temp file + rename, so a crash during
 * write can't leave a half-written base.json.
 */
export function saveProjectState(
  rockFolderPath: string,
  state: ProjectState,
): void {
  if (!existsSync(rockFolderPath)) {
    try {
      mkdirSync(rockFolderPath, { recursive: true })
    } catch {
      return
    }
  }
  ensureGitignored(rockFolderPath)
  const file = projectStatePath(rockFolderPath)
  const tmp = join(tmpdir(), `rock-state-${Date.now()}-${process.pid}.json`)
  try {
    writeFileSync(tmp, JSON.stringify(state, null, 2), 'utf-8')
    renameSync(tmp, file)
  } catch (error) {
    console.warn(
      `[rock] couldn't write ${file}:`,
      error instanceof Error ? error.message : error,
    )
  }
}

/**
 * Make sure `.rock/.gitignore` has `base.json` in it so
 * the state file never gets committed.
 */
function ensureGitignored(rockFolderPath: string): void {
  const gi = join(rockFolderPath, GITIGNORE)
  try {
    if (!existsSync(gi)) {
      writeFileSync(gi, `${FILE}\n`, 'utf-8')
      return
    }
    const current = readFileSync(gi, 'utf-8')
    const lines = current.split(/\r?\n/)
    if (lines.includes(FILE)) return
    const updated =
      current.endsWith('\n') ? `${current}${FILE}\n` : `${current}\n${FILE}\n`
    writeFileSync(gi, updated, 'utf-8')
  } catch {
    /* gitignore is best-effort — don't fail the save */
  }
}

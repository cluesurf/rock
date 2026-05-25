/**
 * Global recents registry — projects Term has launched.
 *
 * Lives at one well-known per-user path; not tied to any
 * specific project. Used to:
 *   - default `term` (with no path arg) to the last
 *     opened project
 *   - power `term list projects` / `term recent`
 *   - drive a future File → Recent menu
 *
 * Capped at 20 entries (LRU by lastOpenedAt). Cleanup of
 * dead entries (projects that no longer exist) happens
 * lazily on read.
 */

import {
  existsSync,
  readFileSync,
  writeFileSync,
  mkdirSync,
  statSync,
} from 'node:fs'
import { join, dirname } from 'node:path'
import { homedir } from 'node:os'

const RECENTS_PATH = join(
  homedir(),
  'Library',
  'Application Support',
  'Term',
  'recents.json',
)

const MAX_ENTRIES = 20

export type RecentProject = {
  /** Path to the project root (the dir containing `.tool/term/`). */
  path: string
  /** Epoch ms of last launch. */
  lastOpenedAt: number
  /** Optional display label. */
  label?: string
}

export type Recents = {
  version: 1
  projects: RecentProject[]
}

export function recentsPath(): string {
  return RECENTS_PATH
}

export function readRecents(): Recents {
  if (!existsSync(RECENTS_PATH)) {
    return { version: 1, projects: [] }
  }
  try {
    const raw = readFileSync(RECENTS_PATH, 'utf-8')
    const parsed = JSON.parse(raw) as Recents
    if (parsed.version !== 1 || !Array.isArray(parsed.projects)) {
      return { version: 1, projects: [] }
    }
    // Drop entries whose project dir no longer exists.
    const alive = parsed.projects.filter(p => {
      try {
        return existsSync(p.path) && statSync(p.path).isDirectory()
      } catch {
        return false
      }
    })
    return { version: 1, projects: alive }
  } catch {
    return { version: 1, projects: [] }
  }
}

export function writeRecents(recents: Recents): void {
  try {
    mkdirSync(dirname(RECENTS_PATH), { recursive: true })
    writeFileSync(RECENTS_PATH, JSON.stringify(recents, null, 2), 'utf-8')
  } catch (error) {
    console.warn(
      '[term] recents write failed:',
      error instanceof Error ? error.message : error,
    )
  }
}

/**
 * Record a project launch. Bumps it to the front of the
 * recents list, drops past-MAX_ENTRIES tail.
 */
export function recordRecentProject(
  projectRoot: string,
  label?: string,
): void {
  const recents = readRecents()
  const filtered = recents.projects.filter(p => p.path !== projectRoot)
  const entry: RecentProject = {
    path: projectRoot,
    lastOpenedAt: Date.now(),
    label,
  }
  const next: Recents = {
    version: 1,
    projects: [entry, ...filtered].slice(0, MAX_ENTRIES),
  }
  writeRecents(next)
}

/** The path of the most-recently-opened project, or null. */
export function mostRecentProject(): string | null {
  const recents = readRecents()
  return recents.projects[0]?.path ?? null
}

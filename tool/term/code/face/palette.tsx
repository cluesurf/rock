import Fuse, { type IFuseOptions } from 'fuse.js'
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { Sheet } from './sheet'
import { useKeys } from './keys'
import { useTerminalStore } from './use-terminal-store'

/**
 * Command palette (Cmd+P).
 *
 * Two flavors of items in the palette:
 *
 * 1. Plain commands (the `commands` prop) — flat label,
 *    runs `action()` on Enter.
 *
 *        usePalette({
 *          hotkey: 'cmd+p',
 *          commands: [
 *            { label: 'Restart api', action: () => restart('api') },
 *          ],
 *        })
 *
 * 2. Tree-path items (auto-populated when `autoSlabs: true`,
 *    or supplied manually by giving a command a `path`).
 *    These render as a VSCode-style two-row entry:
 *
 *        <leaf-name>   <parent > parent > path>
 *
 *    with matched characters highlighted. The default
 *    `autoSlabs` mode flattens the sidebar tree —
 *    `workspace > tab > slab` — into one path per slab.
 *
 * Fuzzy match: powered by fuse.js with `includeMatches` so
 * we can highlight matched characters in both the leaf and
 * the breadcrumb path. Up/Down/Enter for nav. ESC + backdrop
 * click to close (handled by the Sheet).
 *
 * Selecting an autoSlab item calls `setActiveSlab`, which —
 * via the dock's existing focus-on-active rule — re-focuses
 * the xterm terminal once the palette closes (the palette
 * input unmounts, document.body becomes activeElement, and
 * dock.tsx:104 picks up the slab switch and calls
 * `term.focus()`). No extra store wiring needed.
 */

const FUSE_OPTIONS: IFuseOptions<IndexedCommand> = {
  keys: ['searchText'],
  includeMatches: true,
  threshold: 0.4,
  ignoreLocation: true,
  minMatchCharLength: 1,
}

export type PaletteCommand = {
  label: string
  /**
   * Optional breadcrumb path to the item, leaf-last.
   * When present, the palette renders the last segment as
   * the primary label and the leading segments as a muted
   * breadcrumb after it. Fuzzy search matches across the
   * whole path.
   */
  path?: string[]
  group?: string
  hotkey?: string
  icon?: ReactNode
  hidden?: boolean
  action: () => void | Promise<void>
}

export type PaletteController = {
  open: boolean
  show: () => void
  hide: () => void
  toggle: () => void
  commands: PaletteCommand[]
}

export type UsePaletteInput = {
  hotkey?: string
  commands?: PaletteCommand[]
  /**
   * Auto-populate from the current workspaces / tabs / slabs
   * tree. Each slab becomes a breadcrumb path
   * `[workspace, tab, slab]` that selects (and focuses) the
   * slab on Enter.
   */
  autoSlabs?: boolean
  placeholder?: string
}

export function usePalette(input: UsePaletteInput = {}): PaletteController {
  const [open, setOpen] = useState(false)
  const workspaces = useTerminalStore(s => s.workspaces)
  const slabs = useTerminalStore(s => s.slabs)
  const setActive = useTerminalStore(s => s.setActiveSlab)

  const commands = useMemo<PaletteCommand[]>(() => {
    const result = [...(input.commands ?? [])]
    if (input.autoSlabs) {
      for (const workspace of workspaces) {
        for (const tab of workspace.tabs) {
          const slabsInTab = Object.values(slabs).filter(
            s => s.tabId === tab.id,
          )
          for (const slab of slabsInTab) {
            result.push({
              label: slab.name,
              path: [workspace.name, tab.name, slab.name],
              group: 'Slabs',
              action: () => setActive(slab.id),
            })
          }
        }
      }
    }
    return result
  }, [input.commands, input.autoSlabs, workspaces, slabs, setActive])

  useKeys([
    {
      keys: input.hotkey ?? 'cmd+p',
      do: () => setOpen(o => !o),
    },
  ])

  return {
    open,
    show:   () => setOpen(true),
    hide:   () => setOpen(false),
    toggle: () => setOpen(o => !o),
    commands,
  }
}

/**
 * Augment each command with the concatenated text we
 * actually run fuzzy search against. Leaf comes first
 * (heaviest weighted by ordinal position) so a query like
 * "web" matches a slab named "web" before "web-server".
 */
type IndexedCommand = PaletteCommand & {
  searchText: string
}

function indexCommand(cmd: PaletteCommand): IndexedCommand {
  if (cmd.path && cmd.path.length > 0) {
    const reversed = [...cmd.path].reverse()
    return { ...cmd, searchText: reversed.join(' ') }
  }
  return { ...cmd, searchText: cmd.label }
}

/**
 * Resolve fuse's match indices (positions in `searchText`)
 * back into per-segment highlights. Returns a set of
 * matched character offsets keyed by segment index.
 */
function mapMatchesToSegments({
  matches,
  segments,
}: {
  matches: readonly { indices: readonly (readonly [number, number])[] }[]
  segments: string[]
}): Set<number>[] {
  // Recreate the searchText layout (segments reversed +
  // joined by single spaces) so we can find which segment
  // each matched character falls into.
  const reversed = [...segments].reverse()
  const offsets: number[] = []
  let cursor = 0
  for (let i = 0; i < reversed.length; i++) {
    const seg = reversed[i] ?? ''
    offsets.push(cursor)
    cursor += seg.length + 1 // +1 for the joining space
  }

  const highlightsReversed: Set<number>[] = reversed.map(() => new Set<number>())

  for (const m of matches) {
    for (const [start, end] of m.indices) {
      for (let pos = start; pos <= end; pos++) {
        for (let i = reversed.length - 1; i >= 0; i--) {
          const seg = reversed[i] ?? ''
          const segStart = offsets[i] ?? 0
          const segEnd = segStart + seg.length
          if (pos >= segStart && pos < segEnd) {
            highlightsReversed[i]?.add(pos - segStart)
            break
          }
        }
      }
    }
  }

  // Caller wants results in original (leaf-last) order.
  return highlightsReversed.reverse()
}

function renderHighlightedText(
  text: string,
  highlighted: Set<number>,
): ReactNode {
  if (highlighted.size === 0) return text
  const out: ReactNode[] = []
  let buffer = ''
  let bufferMatched = false
  for (let i = 0; i < text.length; i++) {
    const ch = text[i] ?? ''
    const isMatch = highlighted.has(i)
    if (isMatch === bufferMatched) {
      buffer += ch
    } else {
      if (buffer) {
        out.push(
          bufferMatched
            ? <span key={`m${i}`} data-term-palette-match="">{buffer}</span>
            : buffer
        )
      }
      buffer = ch
      bufferMatched = isMatch
    }
  }
  if (buffer) {
    out.push(
      bufferMatched
        ? <span key="m-tail" data-term-palette-match="">{buffer}</span>
        : buffer
    )
  }
  return <>{out}</>
}

export type PaletteProps = {
  controller: PaletteController
  placeholder?: string
}

export function Palette({
  controller,
  placeholder = 'Search slabs, commands…',
}: PaletteProps) {
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  const indexed = useMemo<IndexedCommand[]>(
    () => controller.commands.filter(c => !c.hidden).map(indexCommand),
    [controller.commands],
  )

  const fuse = useMemo(
    () => new Fuse(indexed, FUSE_OPTIONS),
    [indexed],
  )

  type Result = {
    cmd: IndexedCommand
    highlightLabel: Set<number>
    highlightPath: Set<number>[] // per-segment highlights of cmd.path
  }

  const results = useMemo<Result[]>(() => {
    const q = query.trim()

    if (!q) {
      // Show everything in the order it was registered.
      return indexed.map(cmd => ({
        cmd,
        highlightLabel: new Set<number>(),
        highlightPath: cmd.path?.map(() => new Set<number>()) ?? [],
      }))
    }

    return fuse.search(q).map(hit => {
      const cmd = hit.item
      const matches = hit.matches ?? []
      if (cmd.path && cmd.path.length > 0) {
        const perSegment = mapMatchesToSegments({
          matches,
          segments: cmd.path,
        })
        // Leaf is the last path segment, and it's also `label`.
        const leafHighlights = perSegment[perSegment.length - 1] ?? new Set<number>()
        return {
          cmd,
          highlightLabel: leafHighlights,
          highlightPath: perSegment,
        }
      }
      // Plain command: searchText === label, so the indices
      // map straight to label characters.
      const labelHighlights = new Set<number>()
      for (const m of matches) {
        for (const [start, end] of m.indices) {
          for (let pos = start; pos <= end; pos++) labelHighlights.add(pos)
        }
      }
      return {
        cmd,
        highlightLabel: labelHighlights,
        highlightPath: [],
      }
    })
  }, [fuse, indexed, query])

  useEffect(() => {
    if (controller.open) {
      setQuery('')
      setSelected(0)
      requestAnimationFrame(() => inputRef.current?.focus())
    }
  }, [controller.open])

  useEffect(() => {
    setSelected(0)
  }, [query])

  function runSelected() {
    const result = results[selected]
    if (!result) return
    void result.cmd.action()
    controller.hide()
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSelected(s => Math.min(s + 1, results.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSelected(s => Math.max(0, s - 1))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      runSelected()
    }
  }

  return (
    <Sheet open={controller.open} onClose={controller.hide}>
      <div data-term-palette="">
        <input
          ref={inputRef}
          data-term-palette-input=""
          type="text"
          placeholder={placeholder}
          value={query}
          onChange={e => setQuery(e.target.value)}
          onKeyDown={onKeyDown}
        />
        <div data-term-palette-list="" role="listbox">
          {results.length === 0 && (
            <div data-term-palette-empty="">No matches</div>
          )}
          {results.map((r, i) => {
            const { cmd, highlightLabel, highlightPath } = r
            const hasPath = cmd.path && cmd.path.length > 0
            const parents = hasPath ? cmd.path!.slice(0, -1) : []
            const parentHighlights = hasPath ? highlightPath.slice(0, -1) : []
            return (
              <div
                key={`${cmd.group ?? ''}:${cmd.label}:${i}`}
                data-term-palette-item=""
                data-selected={String(i === selected)}
                role="option"
                aria-selected={i === selected}
                onMouseEnter={() => setSelected(i)}
                onClick={runSelected}
              >
                {cmd.icon && (
                  <span data-term-palette-item-icon="">{cmd.icon}</span>
                )}
                <span data-term-palette-item-label="">
                  {renderHighlightedText(cmd.label, highlightLabel)}
                </span>
                {hasPath && parents.length > 0 && (
                  <span data-term-palette-item-path="">
                    {parents.map((seg, segIdx) => (
                      <span key={segIdx} data-term-palette-path-seg="">
                        {segIdx > 0 && (
                          <span data-term-palette-path-sep="">{' › '}</span>
                        )}
                        {renderHighlightedText(
                          seg,
                          parentHighlights[segIdx] ?? new Set<number>(),
                        )}
                      </span>
                    ))}
                  </span>
                )}
                {!hasPath && cmd.group && (
                  <span data-term-palette-item-group="">{cmd.group}</span>
                )}
                {cmd.hotkey && (
                  <span data-term-palette-item-hotkey="">{cmd.hotkey}</span>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </Sheet>
  )
}

import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react'
import type { ISearchOptions } from '@xterm/addon-search'
import { useKeys } from './keys'
import { useTerminalStore } from './use-terminal-store'
import { getSearchAddonForSlab } from './search-registry'

/**
 * Cmd+F search-in-terminal widget — VSCode-style find bar
 * pinned to the top-right of the terminal pane.
 *
 *     const find = useFind()        // binds cmd+f
 *     <Find controller={find} />    // renders the widget
 *
 * Reads the currently-active slab's xterm SearchAddon (each
 * Dock registers its own on mount) and drives it imperatively.
 * Match counts come from the addon's `onDidChangeResults`
 * event so the "N of M" indicator stays in sync with the
 * actual buffer state, even after PTY output changes.
 *
 * Toggles: case-sensitive (Aa), whole-word (ab), regex (.*).
 * Enter / Shift+Enter step through matches. Esc closes.
 */

export type FindController = {
  open: boolean
  show: () => void
  hide: () => void
  toggle: () => void
}

export type UseFindInput = {
  hotkey?: string
}

export function useFind(input: UseFindInput = {}): FindController {
  const [open, setOpen] = useState(false)

  useKeys([
    {
      keys: input.hotkey ?? 'cmd+f',
      do: () => setOpen(o => !o),
    },
  ])

  return {
    open,
    show:   () => setOpen(true),
    hide:   () => setOpen(false),
    toggle: () => setOpen(o => !o),
  }
}

// Decoration colors match the term palette accent so the
// highlighted match in the terminal reads as "the same
// thing the find widget is searching for".
const DECORATIONS = {
  matchBackground: '#8b5cf640',
  matchBorder: '#8b5cf6',
  matchOverviewRuler: '#8b5cf6',
  activeMatchBackground: '#8b5cf6',
  activeMatchBorder: '#a78bfa',
  activeMatchColorOverviewRuler: '#a78bfa',
} as const

export type FindProps = {
  controller: FindController
}

export function Find({ controller }: FindProps) {
  const [query, setQuery] = useState('')
  const [caseSensitive, setCaseSensitive] = useState(false)
  const [wholeWord, setWholeWord] = useState(false)
  const [regex, setRegex] = useState(false)
  const [resultIndex, setResultIndex] = useState(-1)
  const [resultCount, setResultCount] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const activeSlabId = useTerminalStore(s => s.activeSlabId)

  const buildOptions = useCallback(
    (): ISearchOptions => ({
      caseSensitive,
      wholeWord,
      regex,
      decorations: DECORATIONS,
    }),
    [caseSensitive, wholeWord, regex],
  )

  // Re-subscribe to result changes whenever the active slab
  // changes — each terminal has its own addon and its own
  // event stream.
  useEffect(() => {
    const addon = getSearchAddonForSlab(activeSlabId)
    if (!addon) {
      setResultIndex(-1)
      setResultCount(0)
      return
    }
    const sub = addon.onDidChangeResults(e => {
      setResultIndex(e.resultIndex)
      setResultCount(e.resultCount)
    })
    return () => sub.dispose()
  }, [activeSlabId])

  // Focus + select on open so the user can immediately
  // overtype the previous query.
  useEffect(() => {
    if (controller.open) {
      requestAnimationFrame(() => {
        inputRef.current?.focus()
        inputRef.current?.select()
      })
    }
  }, [controller.open])

  // Re-run the search whenever the query or any option
  // changes. Empty query clears decorations.
  useEffect(() => {
    if (!controller.open) return
    const addon = getSearchAddonForSlab(activeSlabId)
    if (!addon) return
    if (!query) {
      addon.clearDecorations()
      setResultIndex(-1)
      setResultCount(0)
      return
    }
    addon.findNext(query, buildOptions())
  }, [query, caseSensitive, wholeWord, regex, activeSlabId, controller.open, buildOptions])

  // When the widget closes, clear the in-terminal decorations
  // so the user gets their clean buffer back.
  useEffect(() => {
    if (controller.open) return
    const addon = getSearchAddonForSlab(activeSlabId)
    addon?.clearDecorations()
  }, [controller.open, activeSlabId])

  function findNext() {
    const addon = getSearchAddonForSlab(activeSlabId)
    if (!addon || !query) return
    addon.findNext(query, buildOptions())
  }

  function findPrev() {
    const addon = getSearchAddonForSlab(activeSlabId)
    if (!addon || !query) return
    addon.findPrevious(query, buildOptions())
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Escape') {
      e.preventDefault()
      controller.hide()
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (e.shiftKey) findPrev()
      else findNext()
    }
  }

  if (!controller.open) return null

  const count =
    !query
      ? ''
      : resultCount === 0
        ? 'No results'
        : `${resultIndex + 1} of ${resultCount}`

  return (
    <div data-term-find="" role="search">
      <input
        ref={inputRef}
        data-term-find-input=""
        type="text"
        placeholder="Find"
        value={query}
        onChange={e => setQuery(e.target.value)}
        onKeyDown={onKeyDown}
      />
      <button
        data-term-find-toggle=""
        data-active={String(caseSensitive)}
        onClick={() => setCaseSensitive(v => !v)}
        title="Match case"
        type="button"
      >
        Aa
      </button>
      <button
        data-term-find-toggle=""
        data-active={String(wholeWord)}
        onClick={() => setWholeWord(v => !v)}
        title="Match whole word"
        type="button"
      >
        ab
      </button>
      <button
        data-term-find-toggle=""
        data-active={String(regex)}
        onClick={() => setRegex(v => !v)}
        title="Use regular expression"
        type="button"
      >
        .*
      </button>
      <span data-term-find-count="">{count}</span>
      <button
        data-term-find-nav=""
        onClick={findPrev}
        title="Previous match (Shift+Enter)"
        type="button"
        aria-label="Previous match"
      >
        ↑
      </button>
      <button
        data-term-find-nav=""
        onClick={findNext}
        title="Next match (Enter)"
        type="button"
        aria-label="Next match"
      >
        ↓
      </button>
      <button
        data-term-find-close=""
        onClick={controller.hide}
        title="Close (Esc)"
        type="button"
        aria-label="Close find"
      >
        ×
      </button>
    </div>
  )
}

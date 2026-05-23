import { useEffect, useRef } from 'react'
import {
  Terminal,
  type ITerminalOptions,
  type ILinkProvider,
  type ILink,
} from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { SearchAddon } from '@xterm/addon-search'
// Note: import '@xterm/xterm/css/xterm.css' must be done
// by the consumer's renderer entry (eg. base/code/main.tsx)
// to avoid TS errors on side-effect imports in this lib.
import { useTerminalApi } from './terminal-api'
import { useTerminalStore } from './use-terminal-store'
import { useRockTheme } from './slab'

export type DockProps = {
  /** Symbolic slab name (the workspace map key). */
  name: string
  className?: string
  /** Pass-through to the xterm Terminal constructor. */
  terminalOptions?: ITerminalOptions
}

const DEFAULT_OPTIONS: ITerminalOptions = {
  cursorBlink: true,
  allowProposedApi: true,
  convertEol: false,
  // Soft cap memory by keeping ~10k lines of scrollback per
  // slab. Override via the `terminalOptions` prop on Dock.
  scrollback: 10000,
}

/**
 * Renders an xterm.js instance bound to a named slab
 * process. Inherits theme from the enclosing `<Slab>`.
 *
 *     <Dock name="web" />
 *
 * Headless by default. Style via the Tailwind preset, the
 * `className` prop, or your own CSS targeting
 * `[data-rock-dock]`.
 */
export function Dock({ name, className, terminalOptions }: DockProps) {
  const api = useTerminalApi()
  const theme = useRockTheme()
  const slabId = useTerminalStore(state => state.slabIdByName[name])
  const slabRecord = useTerminalStore(state =>
    slabId ? state.slabs[slabId] : undefined,
  )
  const activeSlabId = useTerminalStore(state => state.activeSlabId)
  const isActive = slabId !== undefined && slabId === activeSlabId
  const status = slabRecord?.status ?? 'idle'
  const containerRef = useRef<HTMLDivElement | null>(null)
  const termRef = useRef<Terminal | null>(null)
  const fitRef = useRef<FitAddon | null>(null)
  const pendingResizeRef = useRef<number | null>(null)

  // Refocus this terminal when its slab becomes active —
  // but DON'T steal focus from the sidebar tree. If the
  // user clicked a leaf to switch tabs, they're using the
  // sidebar (arrow keys, rename, etc.) and stealing focus
  // here would break that flow.
  //
  // Rule: only auto-focus if either nothing has DOM focus
  // (initial mount) OR the previous focus was on another
  // xterm canvas (switching between terminals from inside
  // a terminal). Skip if focus is in the sidebar / chrome.
  useEffect(() => {
    if (!isActive) return
    const term = termRef.current
    if (!term) return
    const id = requestAnimationFrame(() => {
      const active = document.activeElement as HTMLElement | null
      if (active && active !== document.body) {
        // User is focused somewhere already — only re-focus
        // if they were in another xterm (switching tabs from
        // inside the terminal). Skip if they're in the
        // sidebar tree, a button, an input, etc.
        const inTree = active.closest('[data-rock-tree]')
        const inXterm = active.classList.contains('xterm-helper-textarea')
        if (inTree || !inXterm) return
      }
      term.focus()
    })
    return () => cancelAnimationFrame(id)
  }, [isActive])

  useEffect(() => {
    if (!slabId) return
    const container = containerRef.current
    if (!container) return

    const options: ITerminalOptions = {
      ...DEFAULT_OPTIONS,
      ...(theme?.font ? { fontFamily: theme.font } : {}),
      ...(theme?.fontSize ? { fontSize: theme.fontSize } : {}),
      ...(theme?.lineHeight ? { lineHeight: theme.lineHeight } : {}),
      ...(theme?.cursorBlink !== undefined ? { cursorBlink: theme.cursorBlink } : {}),
      ...(theme?.cursorStyle ? { cursorStyle: theme.cursorStyle } : {}),
      ...(theme
        ? {
            theme: {
              ...(theme.background ? { background: theme.background } : {}),
              ...(theme.foreground ? { foreground: theme.foreground } : {}),
              ...(theme.cursor ? { cursor: theme.cursor } : {}),
              ...(theme.cursorAccent ? { cursorAccent: theme.cursorAccent } : {}),
              ...(theme.selectionBackground ? { selectionBackground: theme.selectionBackground } : {}),
              ...(theme.selectionForeground ? { selectionForeground: theme.selectionForeground } : {}),
              ...(theme.black ? { black: theme.black } : {}),
              ...(theme.red ? { red: theme.red } : {}),
              ...(theme.green ? { green: theme.green } : {}),
              ...(theme.yellow ? { yellow: theme.yellow } : {}),
              ...(theme.blue ? { blue: theme.blue } : {}),
              ...(theme.magenta ? { magenta: theme.magenta } : {}),
              ...(theme.cyan ? { cyan: theme.cyan } : {}),
              ...(theme.white ? { white: theme.white } : {}),
              ...(theme.brightBlack ? { brightBlack: theme.brightBlack } : {}),
              ...(theme.brightRed ? { brightRed: theme.brightRed } : {}),
              ...(theme.brightGreen ? { brightGreen: theme.brightGreen } : {}),
              ...(theme.brightYellow ? { brightYellow: theme.brightYellow } : {}),
              ...(theme.brightBlue ? { brightBlue: theme.brightBlue } : {}),
              ...(theme.brightMagenta ? { brightMagenta: theme.brightMagenta } : {}),
              ...(theme.brightCyan ? { brightCyan: theme.brightCyan } : {}),
              ...(theme.brightWhite ? { brightWhite: theme.brightWhite } : {}),
            },
          }
        : {}),
      ...terminalOptions,
    }

    const term = new Terminal(options)
    const fit = new FitAddon()
    const search = new SearchAddon()

    term.loadAddon(fit)
    term.loadAddon(search)
    // Custom link provider: detects URLs + local paths in
    // the buffer and renders them with a permanent
    // underline (xterm draws it via canvas, so it's always
    // visible — not hover-dependent like WebLinksAddon).
    // Click handlers route through the preload bridge to
    // the OS shell.
    term.registerLinkProvider(makeRockLinkProvider(term))

    // OSC 7 handler: shells that emit `\e]7;file://host/path\a`
    // after each `cd` let us track the working directory
    // without polling. Forwards every change to main via
    // the rock:cwd-change IPC so state-store can persist it.
    //
    // To opt in, the user adds a hook to their shell:
    //   zsh:   function chpwd() { printf '\e]7;file://%s%s\a' "$HOST" "$PWD"; }
    //   bash:  PROMPT_COMMAND='printf "\e]7;file://%s%s\a" "$HOSTNAME" "$PWD"'
    term.parser.registerOscHandler(7, payload => {
      const cwd = parseOsc7(payload)
      if (cwd && slabId) {
        void rockBase()?.notifyCwd?.(slabId, cwd)
      }
      // false = let other handlers also receive this OSC
      return false
    })

    term.open(container)
    fit.fit()
    // Auto-focus so the user can type immediately. Without
    // this, the cursor blinks but keystrokes don't reach
    // the PTY until the user clicks on the canvas.
    term.focus()

    // Multi-line paste warning. xterm pastes whatever's on
    // the clipboard; if it contains newlines, the shell
    // executes each line immediately on hit-Enter. Easy
    // path to disaster (`rm -rf /` snuck into a snippet).
    // Intercept the native paste event and require confirm.
    const pasteHandler = (event: ClipboardEvent) => {
      const text = event.clipboardData?.getData('text') ?? ''
      const newlineCount = (text.match(/\n/g) ?? []).length
      // Trailing newline (one terminating LF) is harmless;
      // 2+ newlines = multi-command paste = danger.
      if (newlineCount >= 2) {
        const ok = window.confirm(
          `Paste ${newlineCount + 1} lines? Each newline executes immediately.`,
        )
        if (!ok) {
          event.preventDefault()
          event.stopPropagation()
        }
      }
    }
    container.addEventListener('paste', pasteHandler, true)

    termRef.current = term
    fitRef.current = fit

    term.onData(data => {
      void api.request({
        type: 'slab:write',
        payload: { slabId, data },
      })
    })

    const unsubscribe = api.onEvent(event => {
      if (event.type !== 'slab:data') return
      if (event.payload.slabId !== slabId) return
      term.write(event.payload.data)
    })

    const sendResize = () => {
      if (!fitRef.current || !termRef.current) return
      fitRef.current.fit()
      const cols = termRef.current.cols
      const rows = termRef.current.rows
      void api.request({
        type: 'slab:resize',
        payload: { slabId, cols, rows },
      })
    }

    const observer = new ResizeObserver(() => {
      if (pendingResizeRef.current !== null) {
        cancelAnimationFrame(pendingResizeRef.current)
      }
      pendingResizeRef.current = requestAnimationFrame(sendResize)
    })
    observer.observe(container)

    sendResize()

    return () => {
      unsubscribe()
      observer.disconnect()
      container.removeEventListener('paste', pasteHandler, true)
      if (pendingResizeRef.current !== null) {
        cancelAnimationFrame(pendingResizeRef.current)
      }
      term.dispose()
      termRef.current = null
      fitRef.current = null
    }
  }, [slabId, api, terminalOptions, theme])

  // Restart the slab's PTY (used by the exit overlay).
  const restart = () => {
    if (!slabId) return
    void api.request({
      type: 'slab:restart',
      payload: { slabId },
    })
  }

  return (
    <div
      data-rock-dock=""
      data-ready={String(Boolean(slabId))}
      data-status={status}
      className={className}
      style={{ width: '100%', height: '100%', position: 'relative' }}
    >
      <div
        ref={containerRef}
        data-rock-dock-canvas=""
        style={{ width: '100%', height: '100%' }}
      />
      {status === 'exited' && (
        <ExitedOverlay
          theme={theme}
          onRestart={restart}
        />
      )}
    </div>
  )
}

function ExitedOverlay({
  theme,
  onRestart,
}: {
  theme?: { background?: string; foreground?: string; accent?: string }
  onRestart: () => void
}) {
  return (
    <div
      data-rock-dock-exited=""
      style={{
        position: 'absolute',
        inset: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: (theme?.background ?? '#000') + 'cc',
        color: theme?.foreground ?? '#888',
        backdropFilter: 'blur(2px)',
        fontFamily: 'inherit',
        fontSize: 13,
      }}
    >
      <div style={{ textAlign: 'center', padding: 16 }}>
        <div style={{ marginBottom: 12, opacity: 0.7 }}>
          process exited
        </div>
        <button
          type="button"
          onClick={onRestart}
          style={{
            padding: '6px 14px',
            background: theme?.accent ?? '#bd93f9',
            color: theme?.background ?? '#000',
            border: 'none',
            borderRadius: 6,
            cursor: 'pointer',
            fontFamily: 'inherit',
            fontSize: 13,
            fontWeight: 600,
          }}
        >
          restart
        </button>
      </div>
    </div>
  )
}

// ────────────────────────────────────────────────────────
// Link provider — URLs + local file paths
// ────────────────────────────────────────────────────────

// URLs: http(s):// + the bulk of the URL up to whitespace
// or a few common boundary chars. Stripped trailing
// punctuation in the activate handler.
const URL_RE = /\b(?:https?|file|ftp):\/\/[^\s<>"']+/g

// Local paths. Three flavors:
//   absolute: /Users/foo/file.tsx  /var/log/system.log
//   tilde:    ~/path/to/file
//   relative: ./src/main.ts  ../lib/util.ts
// Each accepts an optional :line or :line:col suffix.
const PATH_RE =
  /(?:(?:^|[\s(])(?:\/[\w.\-]+(?:\/[\w.\-]+)+|~\/[\w.\-/]+|\.{1,2}\/[\w.\-/]+))(?::\d+(?::\d+)?)?/g

type RockBase = {
  openExternal?: (url: string) => Promise<void>
  openPath?: (filePath: string) => Promise<string>
  notifyCwd?: (slabId: string, cwd: string) => Promise<void>
}

/**
 * Parse an OSC 7 payload — typically `file://hostname/path`.
 * Returns the decoded path, or null on parse failure.
 */
function parseOsc7(payload: string): string | null {
  if (!payload.startsWith('file://')) return null
  const rest = payload.slice('file://'.length)
  const slash = rest.indexOf('/')
  // Path starts at the slash that separates host from path.
  const rawPath = slash >= 0 ? rest.slice(slash) : rest
  try {
    return decodeURIComponent(rawPath)
  } catch {
    return rawPath
  }
}

function rockBase(): RockBase | undefined {
  return (window as unknown as { app?: RockBase }).app
}

function makeRockLinkProvider(term: Terminal): ILinkProvider {
  return {
    provideLinks(bufferLineNumber, callback) {
      const line = term.buffer.active.getLine(bufferLineNumber - 1)
      if (!line) {
        callback(undefined)
        return
      }
      const text = line.translateToString(false)
      const links: ILink[] = []

      for (const m of text.matchAll(URL_RE)) {
        const start = m.index ?? 0
        // xterm coords are 1-indexed.
        const range = {
          start: { x: start + 1, y: bufferLineNumber },
          end:   { x: start + m[0].length, y: bufferLineNumber },
        }
        // Strip trailing punctuation that probably belongs
        // to surrounding prose, not the URL.
        const cleanUrl = m[0].replace(/[).,;!?]+$/, '')
        links.push({
          range,
          text: cleanUrl,
          decorations: { underline: true, pointerCursor: true },
          activate: () => {
            void rockBase()?.openExternal?.(cleanUrl)
          },
        })
      }

      for (const m of text.matchAll(PATH_RE)) {
        // PATH_RE has a leading capture for whitespace/open-paren;
        // recompute the actual path start.
        const raw = m[0]
        const leading = raw.match(/^[\s(]/)?.[0].length ?? 0
        const pathText = raw.slice(leading)
        const start = (m.index ?? 0) + leading
        // Strip any :line:col suffix for the open call but
        // keep them in the underlined range.
        const filePath = pathText.replace(/:\d+(:\d+)?$/, '')
        const range = {
          start: { x: start + 1, y: bufferLineNumber },
          end:   { x: start + pathText.length, y: bufferLineNumber },
        }
        links.push({
          range,
          text: pathText,
          decorations: { underline: true, pointerCursor: true },
          activate: () => {
            void rockBase()?.openPath?.(filePath)
          },
        })
      }

      callback(links.length > 0 ? links : undefined)
    },
  }
}

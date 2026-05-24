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
  // Blinking off by default — the visual jitter is more
  // distracting than helpful, especially when paired with
  // a long-running CLI (Claude Code, watchers) that the
  // user is reading more than typing into. Override with
  // `terminalOptions={{ cursorBlink: true }}` per Dock if
  // needed.
  cursorBlink: false,
  allowProposedApi: true,
  convertEol: false,
  // Soft cap memory by keeping ~10k lines of scrollback per
  // slab. Override via the `terminalOptions` prop on Dock.
  scrollback: 10000,
  // The #1 reason xterm.js terminals look "too bright"
  // vs iTerm2: by default xterm swaps any bold text into
  // the BRIGHT color slot (e.g. white → brightWhite,
  // green → brightGreen). Bold prompts, command headings,
  // ls output — everything bold — fires this swap.
  // iTerm2 ships with the equivalent toggle OFF. Bold
  // text now keeps its color and only gets weight.
  drawBoldTextInBrightColors: false,
  // Base body at weight 300 (Noto Sans Mono Light, loaded
  // via Google Fonts in index.html). Pairs with weight
  // 600 for bold. xterm's canvas renderer can't do macOS
  // subpixel AA, so leaning on a lighter weight is the
  // best way to get an iTerm2-like soft feel.
  fontWeight: 300,
  fontWeightBold: 600,
  // Tells xterm to not boost text contrast above what the
  // theme specifies. Default is 1 (off) so this is a
  // no-op safeguard against future xterm version changes
  // turning it on.
  minimumContrastRatio: 1,
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
  // setTimeout id, not requestAnimationFrame id — we now
  // debounce ~120ms so transient reflows during sidebar
  // drag-and-drop don't fire fit() with intermediate
  // (smaller) widths. xterm doesn't unwrap already-written
  // output when the cols come back, so a brief mid-drag
  // narrow re-fit visibly garbles the terminal.
  const pendingResizeRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Cache of the last (cols, rows) we sent to the PTY so
  // we can skip no-op resize messages.
  const lastSentSizeRef = useRef<{ cols: number; rows: number } | null>(null)

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

    // App-level shortcuts (Cmd+Backspace = close tab,
    // Cmd+T = new tab, Cmd+Shift+G = new group, Cmd+,
    // = open settings, etc.) need to bubble up to the
    // window-level Keys listener even when the terminal
    // has focus. xterm's default keyboard handler eats
    // every keystroke and sends it to the PTY. Returning
    // false from this handler tells xterm "don't process
    // this key", which lets the browser bubble it
    // naturally.
    term.attachCustomKeyEventHandler((event) => {
      if (event.type !== 'keydown') return true
      const mod = event.metaKey || event.ctrlKey
      if (!mod) return true
      // Allow these specific app shortcuts through.
      // Everything else (Cmd+C copy, Cmd+V paste, Cmd+A
      // select-all, etc.) stays with xterm's default
      // behavior so terminal usage isn't disrupted.
      const k = event.key.toLowerCase()
      if (
        event.key === 'Backspace' ||
        event.key === 'Delete' ||
        k === 't' ||
        k === 'w' ||
        k === ',' ||
        k === 'b' ||
        (event.shiftKey && k === 'g') ||
        (event.shiftKey && (k === ']' || k === '['))
      ) {
        return false
      }
      return true
    })
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
    //
    // Also handle file pastes (Cmd+C a file in Finder →
    // Cmd+V here). Electron exposes `File.path` on File
    // objects originating from the filesystem; we paste
    // a shell-escaped path instead of the binary blob,
    // matching iTerm2's behavior.
    const pasteHandler = (event: ClipboardEvent) => {
      const cd = event.clipboardData
      if (!cd) return

      // File paste first — preempts the text branch so a
      // copied Finder file doesn't accidentally trigger
      // the multi-line warning via its text fallback.
      const files = collectClipboardFilePaths(cd)
      if (files.length > 0) {
        event.preventDefault()
        event.stopPropagation()
        const text = files.map(escapeShellPath).join(' ')
        termRef.current?.paste(text)
        return
      }

      const text = cd.getData('text') ?? ''
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

    // Drag-and-drop a file (or files) from Finder onto the
    // terminal — same outcome as a file paste: insert the
    // shell-escaped path(s). Without this, the browser's
    // default drop behavior navigates the renderer to the
    // dropped file's URL, which would crash the dock.
    const dragOverHandler = (event: DragEvent) => {
      if (event.dataTransfer?.types.includes('Files')) {
        event.preventDefault()
        event.stopPropagation()
      }
    }
    const dropHandler = (event: DragEvent) => {
      if (!event.dataTransfer) return
      const paths = collectDataTransferFilePaths(event.dataTransfer)
      if (paths.length === 0) return
      event.preventDefault()
      event.stopPropagation()
      const text = paths.map(escapeShellPath).join(' ')
      termRef.current?.paste(text)
    }
    container.addEventListener('dragover', dragOverHandler, true)
    container.addEventListener('drop', dropHandler, true)

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
      // If the container has no visible size (display:none
      // on an inactive tab, parent collapsed, etc.) the
      // FitAddon computes cols ≈ 1 and the PTY would wrap
      // all subsequent output at 1 column. xterm doesn't
      // unwrap on the next resize, so the next time the
      // tab becomes visible the user sees the squeezed
      // output stuck. Skip until we have real dimensions.
      const w = container.clientWidth
      const h = container.clientHeight
      if (w === 0 || h === 0) return
      fitRef.current.fit()
      const cols = termRef.current.cols
      const rows = termRef.current.rows
      // Sanity floor — even with non-zero dims, a too-small
      // measurement is almost certainly a transient mid-
      // layout state, not what the user wants the PTY to
      // commit to.
      if (cols < 10 || rows < 3) return
      const last = lastSentSizeRef.current
      // Skip if the size hasn't actually changed since we
      // last told the PTY. Stops redundant resize messages
      // and stops the PTY from re-wrapping its scrollback
      // when nothing about the layout actually moved.
      if (last && last.cols === cols && last.rows === rows) return
      lastSentSizeRef.current = { cols, rows }
      void api.request({
        type: 'slab:resize',
        payload: { slabId, cols, rows },
      })
    }

    const observer = new ResizeObserver(() => {
      if (pendingResizeRef.current !== null) {
        clearTimeout(pendingResizeRef.current)
      }
      // 120ms debounce. Long enough that sidebar drag
      // reflows finish before we fit (so xterm doesn't get
      // re-fit to a transient narrow width). Short enough
      // that an actual user resize feels responsive.
      pendingResizeRef.current = setTimeout(sendResize, 120)
    })
    observer.observe(container)

    sendResize()

    return () => {
      unsubscribe()
      observer.disconnect()
      container.removeEventListener('paste', pasteHandler, true)
      container.removeEventListener('dragover', dragOverHandler, true)
      container.removeEventListener('drop', dropHandler, true)
      if (pendingResizeRef.current !== null) {
        clearTimeout(pendingResizeRef.current)
      }
      term.dispose()
      termRef.current = null
      fitRef.current = null
      lastSentSizeRef.current = null
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

// ────────────────────────────────────────────────────────
// File-paste / file-drop helpers
// ────────────────────────────────────────────────────────

/**
 * Pull the original filesystem path off a clipboard-pasted
 * or drag-dropped File object.
 *
 * Electron 32+ removed the `File.path` extension property
 * for security reasons. The official replacement is
 * `webUtils.getPathForFile(file)`, which we expose to the
 * renderer through the preload bridge as
 * `window.app.getPathForFile`. Older Electron versions
 * (and any non-Electron Chromium build) fall back to the
 * legacy `file.path` property.
 */
type LegacyFileWithPath = File & { path?: string }
type RockPreloadBridge = {
  getPathForFile?: (file: File) => string
}

function pathForFile(file: File): string | undefined {
  const bridge = (globalThis as unknown as { app?: RockPreloadBridge }).app
  const fromBridge = bridge?.getPathForFile?.(file)
  if (fromBridge) return fromBridge
  return (file as LegacyFileWithPath).path
}

/**
 * Collect filesystem paths from a clipboard event. Returns
 * [] if the clipboard has no files. iTerm2-equivalent
 * behavior: Cmd+C a file in Finder → Cmd+V here pastes
 * the path.
 */
function collectClipboardFilePaths(cd: DataTransfer): string[] {
  const out: string[] = []
  for (const f of Array.from(cd.files ?? [])) {
    const path = pathForFile(f)
    if (path) out.push(path)
  }
  return out
}

/**
 * Same as the clipboard helper but for a drag-and-drop
 * event's DataTransfer. Used by the dock's drop handler so
 * Finder → terminal drag pastes the shell-escaped path.
 */
function collectDataTransferFilePaths(dt: DataTransfer): string[] {
  const out: string[] = []
  for (const f of Array.from(dt.files ?? [])) {
    const path = pathForFile(f)
    if (path) out.push(path)
  }
  return out
}

/**
 * Shell-escape a filesystem path the way iTerm2 / bash
 * tab-completion does. Backslash-escapes whitespace plus
 * any character with special meaning to a POSIX shell.
 * Round-trips through `cd`, `cat`, etc. unchanged.
 */
function escapeShellPath(p: string): string {
  return p.replace(/([\s"'\\$`!()&;*?<>|{}[\]])/g, '\\$1')
}

import { useEffect, useRef } from 'react'
import { Terminal, type ITerminalOptions } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebLinksAddon } from '@xterm/addon-web-links'
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
  scrollback: 20000,
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
  const containerRef = useRef<HTMLDivElement | null>(null)
  const termRef = useRef<Terminal | null>(null)
  const fitRef = useRef<FitAddon | null>(null)
  const pendingResizeRef = useRef<number | null>(null)

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
      ...(theme?.background || theme?.foreground || theme?.cursor
        ? {
            theme: {
              ...(theme.background ? { background: theme.background } : {}),
              ...(theme.foreground ? { foreground: theme.foreground } : {}),
              ...(theme.cursor ? { cursor: theme.cursor } : {}),
            },
          }
        : {}),
      ...terminalOptions,
    }

    const term = new Terminal(options)
    const fit = new FitAddon()
    const links = new WebLinksAddon()
    const search = new SearchAddon()

    term.loadAddon(fit)
    term.loadAddon(links)
    term.loadAddon(search)

    term.open(container)
    fit.fit()

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
      if (pendingResizeRef.current !== null) {
        cancelAnimationFrame(pendingResizeRef.current)
      }
      term.dispose()
      termRef.current = null
      fitRef.current = null
    }
  }, [slabId, api, terminalOptions, theme])

  return (
    <div
      data-rock-dock=""
      data-ready={String(Boolean(slabId))}
      className={className}
      style={{ width: '100%', height: '100%' }}
    >
      <div
        ref={containerRef}
        data-rock-dock-canvas=""
        style={{ width: '100%', height: '100%' }}
      />
    </div>
  )
}

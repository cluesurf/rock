import { useEffect, useRef } from 'react'
import { Terminal, type ITerminalOptions } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebLinksAddon } from '@xterm/addon-web-links'
import { SearchAddon } from '@xterm/addon-search'
import '@xterm/xterm/css/xterm.css'
import { useTerminalApi } from './terminal-api'

export type TerminalSlabProps = {
  slabId: string
  className?: string
  terminalOptions?: ITerminalOptions
}

const DEFAULT_OPTIONS: ITerminalOptions = {
  cursorBlink: true,
  allowProposedApi: true,
  convertEol: false,
  fontFamily:
    'Cascadia Code, JetBrains Mono, Menlo, Monaco, Consolas, "Liberation Mono", monospace',
  fontSize: 13,
  lineHeight: 1.15,
  theme: {
    background: '#0b0d10',
    foreground: '#d8dee9',
  },
  scrollback: 20000,
  windowsMode: false,
}

export function TerminalSlab({
  slabId,
  className,
  terminalOptions,
}: TerminalSlabProps) {
  const api = useTerminalApi()
  const containerRef = useRef<HTMLDivElement | null>(null)
  const termRef = useRef<Terminal | null>(null)
  const fitRef = useRef<FitAddon | null>(null)
  const pendingResizeRef = useRef<number | null>(null)

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const term = new Terminal({ ...DEFAULT_OPTIONS, ...terminalOptions })

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
        payload: {
          slabId,
          data,
        },
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
        payload: {
          slabId,
          cols,
          rows,
        },
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
  }, [slabId, api, terminalOptions])

  return (
    <div className={className} style={{ width: '100%', height: '100%' }}>
      <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
    </div>
  )
}

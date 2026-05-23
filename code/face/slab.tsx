import { useEffect, createContext, useContext, type ReactNode } from 'react'
import { TerminalApiProvider } from './terminal-api'
import { TerminalEvents } from './terminal-events'
import { useTerminalStore } from './use-terminal-store'

/**
 * The top-level rock instance — the whole terminal app
 * window. One `<Slab>` per window. Wraps your app tree
 * with the terminal API context, event subscription, slab-
 * map bridge, and optional theme.
 *
 *     mount(
 *       <Slab theme={themes.dracula}>
 *         <Nest direction="horizontal">
 *           <Tree>...</Tree>
 *           <Dock name="web" />
 *         </Nest>
 *       </Slab>
 *     )
 *
 * Inside a Slab you compose Tree, Nest, Dock, Bar,
 * Palette, etc.
 */

export type RockTheme = {
  background?: string
  foreground?: string
  cursor?: string
  cursorStyle?: 'block' | 'underline' | 'bar'
  cursorBlink?: boolean
  font?: string
  fontSize?: number
  lineHeight?: number
  palette?: Record<string, string> | string
}

const ThemeContext = createContext<RockTheme | undefined>(undefined)

export function useRockTheme(): RockTheme | undefined {
  return useContext(ThemeContext)
}

export type SlabProps = {
  /**
   * Optional theme. Children that render terminals (Dock)
   * read this via `useRockTheme()` to style xterm.
   */
  theme?: RockTheme
  /**
   * Render an always-on drag strip at the top of the window.
   * Required when `titleBarStyle: 'hiddenInset'` is used so
   * the user can drag the window. Default true.
   * Height defaults to 28px (covers the macOS traffic-light
   * gutter). Buttons / inputs INSIDE the strip should set
   * `style={{ WebkitAppRegion: 'no-drag' }}`.
   */
  draggable?: boolean
  className?: string
  children: ReactNode
}

export function Slab({
  theme,
  draggable = true,
  className,
  children,
}: SlabProps) {
  const w = window as unknown as { app?: { terminal: any } }
  if (!w.app?.terminal) {
    throw new Error(
      "<Slab>: window.app.terminal not exposed. Did you 'import \"@cluesurf/rock/boot/preload\"' in your preload?",
    )
  }

  return (
    <TerminalApiProvider api={w.app.terminal}>
      <TerminalEvents />
      <SlabMapBridge />
      <ThemeContext.Provider value={theme}>
        <div
          data-rock-slab=""
          className={className}
          style={{
            position: 'relative',
            width: '100vw',
            height: '100vh',
            overflow: 'hidden',
          }}
        >
          {draggable && (
            <div
              data-rock-drag=""
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                height: 28,
                zIndex: 100,
                pointerEvents: 'none',
                // The drag region works without pointer events;
                // app-region is its own thing.
                WebkitAppRegion: 'drag',
              } as React.CSSProperties}
            />
          )}
          {children}
        </div>
      </ThemeContext.Provider>
    </TerminalApiProvider>
  )
}

function SlabMapBridge() {
  const setSlabMap = useTerminalStore(s => s.setSlabMap)
  useEffect(() => {
    const w = window as unknown as {
      app: {
        onSlabMap?: (cb: (m: Record<string, string>) => void) => () => void
        getSlabMap?: () => Promise<Record<string, string>>
      }
    }
    // Pull the current map immediately (avoids race with the push).
    w.app.getSlabMap?.().then(map => {
      if (map) setSlabMap(map)
    })
    // Subscribe to future updates.
    return w.app.onSlabMap?.(map => setSlabMap(map))
  }, [setSlabMap])
  return null
}

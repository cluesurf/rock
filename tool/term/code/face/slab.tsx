import { useEffect, createContext, useContext, type ReactNode } from 'react'
import { TerminalApiProvider } from './terminal-api'
import { TerminalEvents } from './terminal-events'
import { useTerminalStore } from './use-terminal-store'
import type { TermTheme } from '@/base/theme'
export type { TermTheme }

/**
 * The top-level term instance — the whole terminal app
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

const ThemeContext = createContext<TermTheme | undefined>(undefined)

export function useTermTheme(): TermTheme | undefined {
  return useContext(ThemeContext)
}

export type SlabProps = {
  /**
   * Optional theme. Children that render terminals (Dock)
   * read this via `useTermTheme()` to style xterm.
   */
  theme?: TermTheme
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
      "<Slab>: window.app.terminal not exposed. Did you 'import \"@cluesurf/term/boot/preload\"' in your preload?",
    )
  }

  // Project every theme color out as a CSS variable so the
  // Tailwind preset (and any consumer CSS) can drive chrome
  // colors from the theme. Variables are scoped to the Slab
  // root, so multiple Slabs with different themes can coexist.
  const cssVars = themeToCssVars(theme)

  return (
    <TerminalApiProvider api={w.app.terminal}>
      <TerminalEvents />
      <SlabMapBridge />
      <ThemeContext.Provider value={theme}>
        <div
          data-term-slab=""
          className={className}
          style={{
            position: 'relative',
            width: '100vw',
            height: '100vh',
            overflow: 'hidden',
            ...cssVars,
          }}
        >
          {draggable && (
            <div
              data-term-drag=""
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

/**
 * Project a TermTheme into CSS custom properties. Returned
 * object is suitable to spread into a style prop. The
 * Tailwind preset reads these via `var(--term-bg)` etc. so
 * sidebar / branch / leaf chrome follows the theme.
 *
 * Fallbacks are sensible zinc-based values for theme-less
 * Slabs so the chrome still renders reasonably.
 */
function themeToCssVars(theme?: TermTheme): React.CSSProperties {
  // Deriving sensible defaults for the chrome from the
  // existing color slots:
  //   --term-bg            theme.background   ?? zinc-950
  //   --term-fg            theme.foreground   ?? zinc-200
  //   --term-muted         theme.brightBlack  ?? zinc-500
  //   --term-faint         theme.brightBlack  @ 60% (use the same)
  //   --term-border        theme.selectionBackground ?? zinc-800
  //   --term-active-bg     theme.selectionBackground ?? zinc-800
  //   --term-hover-bg      theme.selectionBackground + alpha
  //   --term-accent        theme.accent       ?? violet-500
  //   --term-status-running   theme.green     ?? emerald-500
  //   --term-status-exited    theme.brightBlack ?? zinc-500
  //   --term-status-failed    theme.red       ?? rose-500
  //   --term-status-starting  theme.yellow    ?? yellow-500
  //   --term-status-idle      theme.brightBlack @ 50%
  const bg = theme?.background ?? '#09090b'
  const fg = theme?.foreground ?? '#e4e4e7'
  const muted = theme?.brightBlack ?? '#71717a'
  const border = theme?.selectionBackground ?? '#27272a'
  const activeBg = border
  const accent = theme?.accent ?? '#8b5cf6'
  const statusRunning = theme?.green ?? '#10b981'
  const statusExited = muted
  const statusFailed = theme?.red ?? '#f43f5e'
  const statusStarting = theme?.yellow ?? '#eab308'

  return {
    // The cast keeps TS happy; React's CSSProperties doesn't
    // type custom properties.
    ['--term-bg' as string]: bg,
    ['--term-fg' as string]: fg,
    ['--term-muted' as string]: muted,
    ['--term-border' as string]: border,
    ['--term-active-bg' as string]: activeBg,
    ['--term-hover-bg' as string]: activeBg + '80',
    ['--term-accent' as string]: accent,
    ['--term-font' as string]:
      theme?.font ??
      'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Monaco, Consolas, monospace',
    ['--term-status-running' as string]: statusRunning,
    ['--term-status-exited' as string]: statusExited,
    ['--term-status-failed' as string]: statusFailed,
    ['--term-status-starting' as string]: statusStarting,
    ['--term-status-idle' as string]: muted,
  }
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

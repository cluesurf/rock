/**
 * Rock.app default React shell.
 *
 * On mount it asks the main process which JIT bundles
 * exist (via `window.app.getUserBundles()`). If the user
 * has a `.rock/layout.tsx`, that compiled module is
 * imported from `rock://user/layout.js` and rendered
 * inside the Slab. Otherwise this falls back to a small
 * single-shell default so the app is usable with no
 * configuration.
 *
 * Anything fancier (multi-pane layouts, sidebars, status
 * bars, palette commands) is the user's job — they write
 * it in `.rock/layout.tsx` and Rock JIT-compiles it.
 */

import { useEffect, useState } from 'react'
import type { ComponentType } from 'react'
import { Slab, Dock, loadUserModule } from '@cluesurf/rock/face'

type Phase =
  | { stage: 'loading' }
  | { stage: 'user'; Component: ComponentType }
  | { stage: 'default' }
  | { stage: 'error'; message: string }

declare global {
  interface Window {
    app: {
      getUserBundles(): Promise<string[]>
    }
  }
}

export function App() {
  const [phase, setPhase] = useState<Phase>({ stage: 'loading' })

  useEffect(() => {
    let cancelled = false
    const loadUserLayout = async () => {
      try {
        const bundles = await window.app.getUserBundles()
        if (cancelled) return
        if (bundles.includes('layout.js')) {
          const Component = await loadUserModule<ComponentType>(
            'layout.js',
          )
          if (cancelled) return
          setPhase({ stage: 'user', Component })
          return
        }
        setPhase({ stage: 'default' })
      } catch (error) {
        if (cancelled) return
        setPhase({
          stage: 'error',
          message:
            error instanceof Error ? error.message : String(error),
        })
      }
    }
    loadUserLayout()
    return () => {
      cancelled = true
    }
  }, [])

  if (phase.stage === 'loading') {
    return <Splash text="rock" />
  }

  if (phase.stage === 'error') {
    return (
      <Splash
        text={`failed to load .rock/layout.tsx — ${phase.message}`}
      />
    )
  }

  if (phase.stage === 'user') {
    const User = phase.Component
    return <User />
  }

  return <DefaultShell />
}

function Splash({ text }: { text: string }) {
  return (
    <div className="flex h-full w-full items-center justify-center bg-neutral-950 text-neutral-500">
      {text}
    </div>
  )
}

function DefaultShell() {
  return (
    <Slab>
      <div className="h-full w-full p-2">
        <Dock name="term" />
      </div>
    </Slab>
  )
}

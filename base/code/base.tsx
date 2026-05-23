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

import { useCallback, useEffect, useMemo, useState } from 'react'
import type { ComponentType } from 'react'
import {
  Slab,
  Dock,
  Keys,
  TreeView,
  loadUserModule,
  useAnyBusySlabs,
  useRockTheme,
  useTerminalApi,
  useTerminalStore,
} from '@cluesurf/rock/face'
import {
  flatTree,
  flattenLeaves,
  removeNode,
  type LeafNode,
  type TreeNode,
} from '@cluesurf/rock/base'
import { cluesurfDark as cluesurf } from '@cluesurf/rock/theme/cluesurf/dark'

type Phase =
  | { stage: 'loading' }
  | { stage: 'user'; Component: ComponentType }
  | { stage: 'default' }
  | { stage: 'error'; message: string }

declare global {
  interface Window {
    app: {
      getUserBundles(): Promise<string[]>
      newSlab(opts?: {
        name?: string
        program?: string
        cwd?: string
        command?: string
      }): Promise<{ name: string; id: string }>
      renameSlab?(name: string, label: string): Promise<void>
      getTree?(): Promise<TreeNode[] | null>
      saveTree?(tree: TreeNode[]): Promise<void>
      toggleFullscreen?(): Promise<void>
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
        if (bundles.includes('app.js')) {
          // The user's .rock/code/index.ts default-exports
          // { Layout?, Sidebar?, commands?, ... }. Pull
          // Layout if present; otherwise fall through to
          // the default shell.
          const exported = await loadUserModule<{
            Layout?: ComponentType
          }>('app.js')
          if (cancelled) return
          if (exported.Layout) {
            setPhase({ stage: 'user', Component: exported.Layout })
            return
          }
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
        text={`failed to load .rock/code/index.ts — ${phase.message}`}
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
  // Splash renders before the user's theme is applied (no
  // Slab wrapper yet). Use the default theme values so it
  // matches the app once mounted.
  return (
    <div
      className="flex h-full w-full items-center justify-center"
      style={{ background: cluesurf.background, color: cluesurf.brightBlack }}
    >
      {text}
    </div>
  )
}

function DefaultShell() {
  return (
    <Slab theme={cluesurf}>
      <ShellContent />
    </Slab>
  )
}

// Walk the tree collecting every leaf's slabName into a Set
// (used to detect slabs missing from the tree).
function collectSlabNames(tree: TreeNode[], out: Set<string>): void {
  for (const node of tree) {
    if (node.kind === 'leaf') out.add(node.slabName)
    else collectSlabNames(node.children, out)
  }
}

function clampWidth(n: number): number {
  if (n < 140) return 140
  // Never wider than half the window — keep the terminal
  // pane at least as wide as the sidebar at all times.
  const max = Math.min(520, Math.floor(window.innerWidth / 2))
  if (n > max) return max
  return n
}

// Persisted custom labels keyed by slab NAME (the internal
// id like 'term', 'term-2'). The slab name stays stable;
// only the display label changes.
const LABEL_STORAGE_KEY = 'rock:labels'

function loadLabels(): Record<string, string> {
  try {
    const raw = window.localStorage.getItem(LABEL_STORAGE_KEY)
    return raw ? (JSON.parse(raw) as Record<string, string>) : {}
  } catch {
    return {}
  }
}

function saveLabels(labels: Record<string, string>): void {
  try {
    window.localStorage.setItem(
      LABEL_STORAGE_KEY,
      JSON.stringify(labels),
    )
  } catch {
    /* full disk, private mode, etc. — ignore */
  }
}

function ShellContent() {
  // Slab names come from the workspace + anything added at
  // runtime via window.app.newSlab(). slabIdByName is the
  // source of truth — boot broadcasts it on every change.
  const slabIdByName = useTerminalStore(s => s.slabIdByName)
  const setActive = useTerminalStore(s => s.setActiveSlab)
  const activeSlabId = useTerminalStore(s => s.activeSlabId)
  const theme = useRockTheme()

  // Sidebar visibility — toggled by Cmd+B. Persists in
  // localStorage so it survives reloads (cheap, no IPC).
  const [sidebarVisible, setSidebarVisible] = useState<boolean>(() => {
    try {
      return window.localStorage.getItem('rock:sidebar-visible') !== 'false'
    } catch {
      return true
    }
  })
  useEffect(() => {
    try {
      window.localStorage.setItem(
        'rock:sidebar-visible',
        sidebarVisible ? 'true' : 'false',
      )
    } catch { /* ignore */ }
  }, [sidebarVisible])

  // Sidebar width (px) — draggable divider on the right
  // edge sets it. Clamped 140–520. Persisted.
  const [sidebarWidth, setSidebarWidth] = useState<number>(() => {
    try {
      const raw = window.localStorage.getItem('rock:sidebar-width')
      const n = raw ? Number(raw) : 224
      return Number.isFinite(n) ? clampWidth(n) : 224
    } catch {
      return 224
    }
  })
  useEffect(() => {
    try {
      window.localStorage.setItem('rock:sidebar-width', String(sidebarWidth))
    } catch { /* ignore */ }
  }, [sidebarWidth])
  // When the window resizes, re-clamp the sidebar so it
  // never exceeds half-width.
  useEffect(() => {
    function onResize() {
      setSidebarWidth(w => clampWidth(w))
    }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])
  const startSidebarResize = (startX: number, startWidth: number) => {
    function onMove(event: MouseEvent) {
      setSidebarWidth(clampWidth(startWidth + (event.clientX - startX)))
    }
    function onUp() {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
  }

  // Sidebar tree: hydrated from .rock/base.json on mount,
  // saved back to disk on every mutation. If no persisted
  // tree exists, fall back to a flat list of every slab.
  const [tree, setTree] = useState<TreeNode[] | null>(null)
  useEffect(() => {
    let cancelled = false
    const load = async () => {
      const saved = await window.app.getTree?.()
      if (cancelled) return
      setTree(saved && saved.length > 0 ? saved : null)
    }
    load()
    return () => {
      cancelled = true
    }
  }, [])

  // Whenever slabIdByName changes (slab added at runtime),
  // make sure every slab has a leaf in the tree. New slabs
  // get appended at root.
  useEffect(() => {
    const names = Object.keys(slabIdByName)
    if (names.length === 0) return
    if (tree === null) {
      setTree(flatTree(names))
      return
    }
    const present = new Set<string>()
    collectSlabNames(tree, present)
    const missing = names.filter(n => !present.has(n))
    if (missing.length === 0) return
    setTree(prev => {
      const base = prev ?? []
      return [...base, ...flatTree(missing)]
    })
  }, [slabIdByName, tree])

  // Persist tree on every change.
  const handleTreeChange = useCallback((next: TreeNode[]) => {
    setTree(next)
    void window.app.saveTree?.(next)
  }, [])

  const handleActivateLeaf = useCallback(
    (leaf: LeafNode) => {
      const id = slabIdByName[leaf.slabName]
      if (id) setActive(id)
      // If the slab doesn't exist (was deleted, or a leaf
      // for a not-yet-spawned slab), spawn it.
      else {
        void window.app.newSlab({ name: leaf.slabName }).then(({ name }) => {
          // setActive after the slab-map broadcast arrives.
          setTimeout(() => {
            const id = useTerminalStore.getState().slabIdByName[name]
            if (id) setActive(id)
          }, 50)
        })
      }
    },
    [slabIdByName, setActive],
  )

  const handleRequestNewSlab = useCallback(async () => {
    const { name } = await window.app.newSlab()
    return { name }
  }, [])

  // ── Confirm close on running processes ─────────────────
  // If any slab has shown output in the last 5s, treat as
  // "still running" and confirm before closing the window.
  const busySlabs = useAnyBusySlabs(5000)
  useEffect(() => {
    function onBeforeUnload(e: BeforeUnloadEvent) {
      if (busySlabs.size === 0) return
      const ok = window.confirm(
        `Rock has ${busySlabs.size} active terminal${busySlabs.size === 1 ? '' : 's'}. Close anyway?`,
      )
      if (!ok) {
        e.preventDefault()
        e.returnValue = ''
      }
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [busySlabs])

  // Request notification permission once — used by the
  // command-duration notifier in TreeView's LeafRow.
  useEffect(() => {
    if (
      typeof Notification !== 'undefined' &&
      Notification.permission === 'default'
    ) {
      void Notification.requestPermission().catch(() => {})
    }
  }, [])

  // Kill the underlying PTY when a leaf is deleted from
  // the tree so we don't leak shells (or any long-running
  // process) just because their sidebar row disappeared.
  const api = useTerminalApi()
  const handleDeleteLeaf = useCallback(
    (leaf: LeafNode) => {
      const id = useTerminalStore.getState().slabIdByName[leaf.slabName]
      if (!id) return
      void api.request({ type: 'slab:kill', payload: { slabId: id } })
    },
    [api],
  )

  // Shell color palette. Chrome (sidebar + active row) is
  // one shade lighter than the terminal background so the
  // panes layer cleanly.
  //   terminal:  theme.background       (zinc-950 for cluesurf)
  //   sidebar:   zinc-900 (one step up)
  //   active:    zinc-700 (clear contrast)
  const ui = {
    background: theme?.background ?? '#09090b',
    chromeBg: '#18181b', // zinc-900 — sidebar / chrome panel
    foreground: theme?.foreground ?? '#e4e4e7',
    border: '#27272a', // zinc-800
    muted: theme?.brightBlack ?? '#71717a',
    activeBg: '#3f3f46', // zinc-700 — selected leaf
    hoverBg: '#27272a80', // zinc-800 at 50%
    accent: theme?.accent ?? '#8b5cf6',
  }

  // User-edited display labels, persisted in localStorage.
  const [labels, setLabels] = useState<Record<string, string>>(loadLabels)

  const renameSlab = useCallback(
    (name: string, newLabel: string) => {
      setLabels(prev => {
        const next = { ...prev }
        const trimmed = newLabel.trim()
        if (trimmed.length === 0 || trimmed === name) {
          delete next[name]
        } else {
          next[name] = trimmed
        }
        saveLabels(next)
        return next
      })
      // Also persist to .rock/base.json via main process
      // so the label survives across launches without
      // relying on localStorage.
      void window.app.renameSlab?.(name, newLabel.trim())
    },
    [],
  )

  const slabNames = useMemo(
    () => Object.keys(slabIdByName),
    [slabIdByName],
  )

  // Auto-activate the first slab when nothing is active yet.
  useEffect(() => {
    if (!activeSlabId && slabNames.length > 0) {
      const firstId = slabIdByName[slabNames[0]!]
      if (firstId) setActive(firstId)
    }
  }, [activeSlabId, slabNames, slabIdByName, setActive])

  // Cmd+T          → spawn a new slab and focus it
  // Cmd+Shift+G    → create a new top-level group (works
  //                  even when xterm is focused; TreeView
  //                  also handles this when a row is focused
  //                  for "sibling of focused" behavior)
  // Cmd+Shift+] / [ → cycle slabs
  const bindings = useMemo(
    () => [
      {
        keys: 'cmd+t',
        do: async () => {
          // Skip if focus is in the tree — the TreeView's
          // per-row handler already spawned. Avoids the
          // double-spawn that happened before stopProp
          // started working reliably across handlers.
          if (
            document.activeElement instanceof HTMLElement &&
            document.activeElement.closest('[data-rock-tree]')
          ) return
          const { name } = await window.app.newSlab()
          setTimeout(() => {
            const id =
              useTerminalStore.getState().slabIdByName[name]
            if (id) setActive(id)
          }, 50)
        },
      },
      {
        keys: 'cmd+shift+g',
        do: () => {
          // Create a new top-level group. The TreeView's
          // per-row handler also handles Cmd+Shift+G to
          // create as a sibling of the focused row.
          setTree(prev => {
            const base = prev ?? []
            const newGroup: TreeNode = {
              kind: 'group',
              id: `g_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
              label: 'group',
              collapsed: false,
              children: [],
            }
            const next = [...base, newGroup]
            void window.app.saveTree?.(next)
            return next
          })
        },
      },
      {
        keys: 'cmd+shift+]',
        do: () => cycleSlab(+1),
      },
      {
        keys: 'cmd+shift+[',
        do: () => cycleSlab(-1),
      },
      {
        keys: 'cmd+backspace',
        do: () => closeFocusedTab(),
      },
      {
        keys: 'cmd+b',
        do: () => setSidebarVisible(v => !v),
      },
      {
        keys: 'ctrl+cmd+f',
        do: () => void window.app.toggleFullscreen?.(),
      },
    ],
    [setActive],
  )

  /**
   * Close the active slab's tab: kill the PTY, remove its
   * leaf from the tree, persist. If the tree is empty after
   * removal, close the window so Cmd+Backspace on the last
   * tab quits the app gracefully.
   */
  function closeFocusedTab() {
    setTree(prev => {
      if (!prev) return prev
      const state = useTerminalStore.getState()
      const activeId = state.activeSlabId
      if (!activeId) return prev
      const slabName = Object.keys(state.slabIdByName).find(
        n => state.slabIdByName[n] === activeId,
      )
      if (!slabName) return prev
      // Remove every leaf pointing at this slabName (usually
      // one, but a leaf can be cloned to appear in multiple
      // groups). Kill the PTY once.
      const leaves = flattenLeaves(prev).filter(l => l.slabName === slabName)
      let next = prev
      for (const leaf of leaves) {
        next = removeNode(next, leaf.id).tree
      }
      void api.request({ type: 'slab:kill', payload: { slabId: activeId } })
      void window.app.saveTree?.(next)
      if (flattenLeaves(next).length === 0) {
        // Last tab gone → close the window. Defer one tick so
        // the state update finishes first.
        setTimeout(() => window.close(), 50)
      }
      return next
    })
  }

  function cycleSlab(delta: number) {
    const names = Object.keys(
      useTerminalStore.getState().slabIdByName,
    )
    if (names.length === 0) return
    const currentId = useTerminalStore.getState().activeSlabId
    const currentName = names.find(
      n => useTerminalStore.getState().slabIdByName[n] === currentId,
    )
    const currentIndex = currentName ? names.indexOf(currentName) : -1
    const nextIndex =
      (currentIndex + delta + names.length) % names.length
    const nextId =
      useTerminalStore.getState().slabIdByName[names[nextIndex]!]
    if (nextId) setActive(nextId)
  }

  return (
    <div
      className="flex h-full w-full"
      style={{ background: ui.background, color: ui.foreground }}
    >
      {sidebarVisible && (
        <>
          <aside
            className="shrink-0 flex flex-col relative"
            style={{
              width: sidebarWidth,
              background: ui.chromeBg,
              borderRight: `1px solid ${ui.border}`,
            }}
          >
            {/* Drag-region spacer so the macOS title bar
                can be grabbed despite titleBarStyle hidden. */}
            <div
              className="h-10"
              style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
            />
            {tree && (
              <TreeView
                tree={tree}
                onChange={handleTreeChange}
                onActivateLeaf={handleActivateLeaf}
                onRequestNewSlab={handleRequestNewSlab}
                onDeleteLeaf={handleDeleteLeaf}
                className="flex-1 overflow-auto"
              />
            )}
            {/* Resizer — 4px-wide grab strip on the right
                edge. Cursor changes to col-resize on hover. */}
            <div
              onMouseDown={(e) => {
                e.preventDefault()
                startSidebarResize(e.clientX, sidebarWidth)
              }}
              style={{
                position: 'absolute',
                top: 0,
                right: -2,
                bottom: 0,
                width: 4,
                cursor: 'col-resize',
                zIndex: 10,
              }}
              aria-label="resize sidebar"
            />
          </aside>
        </>
      )}
      <main
        className="flex-1 min-w-0 p-2 relative"
        style={{ background: ui.background }}
      >
        {/* Render every slab; hide all but the active one.
            xterm + PTY keep running in the background so
            switching tabs preserves scrollback + state. */}
        {slabNames.map(name => {
          const id = slabIdByName[name]
          const isActive = id !== undefined && id === activeSlabId
          return (
            <div
              key={name}
              className="absolute inset-2"
              style={{ display: isActive ? 'block' : 'none' }}
            >
              <Dock name={name} />
            </div>
          )
        })}
      </main>
      <Keys bindings={bindings} />
    </div>
  )
}

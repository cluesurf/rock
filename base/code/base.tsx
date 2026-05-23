// ────────────────────────────────────────────────────────
// Minimal starter for @cluesurf/rock-demo.
//
// <Slab> is the top-level rock instance (one per window).
// Inside it: compose any layout from rock primitives + your
// own React. The demo keeps it simple: sidebar + nested
// dock layout. Add bars, palettes, toasts, etc. when you
// want them.
// ────────────────────────────────────────────────────────

import {
  Slab,
  Nest,
  Dock,
  Tree,
  Branch,
  Leaf,
  useTerminalStore,
} from '@cluesurf/rock/face'

export function App() {
  return (
    <Slab>
      <div className="flex h-full w-full">
        <Sidebar />
        <main className="flex-1 min-w-0 p-2">
          <Nest direction="horizontal" ratio={0.55} gap={8}>
            <Dock name="term" />
            <Nest direction="vertical" ratio={0.6} gap={8}>
              <Dock name="monitor" />
              <Dock name="clock" />
            </Nest>
          </Nest>
        </main>
      </div>
    </Slab>
  )
}

function Sidebar() {
  const workspace = useTerminalStore(state => state.workspaces[0])
  return (
    <aside className="w-60 border-r border-neutral-800 bg-neutral-950">
      <div className="h-10" />
      <div className="px-3 pb-2 text-xs uppercase tracking-wider text-neutral-500">
        {workspace?.name ?? 'rock-demo'}
      </div>
      <Tree>
        <Branch label="App">
          <Leaf slab="term" label="zsh" />
        </Branch>
        <Branch label="Tools">
          <Leaf slab="monitor" label="top" />
          <Leaf slab="clock" label="watch date" />
        </Branch>
      </Tree>
    </aside>
  )
}

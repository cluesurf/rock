import { useEffect } from 'react'
import {
  TerminalApiProvider,
  TerminalEvents,
  useTerminalStore,
} from '@cluesurf/rock/face'
import { Split, Slab } from '@cluesurf/rock/face/layout-components'
import {
  SidebarSection,
  SlabButton,
} from '@cluesurf/rock/face/sidebar-components'

export function App() {
  return (
    <TerminalApiProvider api={window.app.terminal}>
      <TerminalEvents />
      <SlabMapBridge />
      <Shell />
    </TerminalApiProvider>
  )
}

/**
 * Pulls the symbolic-name → slab-ID map from the main
 * process into the React store so `<Slab name="shell" />`
 * resolves correctly. Demo-only glue; a real app would
 * compute this from the loaded workspace.
 */
function SlabMapBridge() {
  const setSlabMap = useTerminalStore(state => state.setSlabMap)
  useEffect(() => {
    return window.app.onSlabMap(map => {
      setSlabMap(map)
    })
  }, [setSlabMap])
  return null
}

function Shell() {
  const workspace = useTerminalStore(state => state.workspaces[0])

  return (
    <div className="flex h-screen w-screen">
      <aside className="flex h-full w-60 flex-col overflow-auto border-r border-neutral-800 bg-neutral-950 p-3">
        <div className="px-2 pb-3 pt-1 text-xs uppercase tracking-wider text-neutral-500">
          {workspace?.name ?? 'rock-demo'}
        </div>
        <Sidebar />
      </aside>
      <main className="h-full min-w-0 flex-1">
        <Layout />
      </main>
    </div>
  )
}

function Sidebar() {
  return (
    <>
      <SidebarSection title="Shell">
        <SlabButton name="shell" label="zsh" />
      </SidebarSection>
      <SidebarSection title="Tools">
        <SlabButton name="monitor" label="top" />
        <SlabButton name="clock" label="watch date" />
      </SidebarSection>
    </>
  )
}

function Layout() {
  return (
    <Split horizontal ratio={0.55}>
      <Slab name="shell" />
      <Split vertical ratio={0.6}>
        <Slab name="monitor" />
        <Slab name="clock" />
      </Split>
    </Split>
  )
}

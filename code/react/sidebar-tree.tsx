import { useTerminalStore } from './use-terminal-store'
import type { SlabStatus } from '@/base/types'

export function SidebarTree() {
  const workspaces = useTerminalStore(state => state.workspaces)
  const slabs = useTerminalStore(state => state.slabs)
  const activeSlabId = useTerminalStore(state => state.activeSlabId)
  const setActiveSlab = useTerminalStore(state => state.setActiveSlab)

  return (
    <aside
      style={{
        height: '100%',
        width: 288,
        borderRight: '1px solid #1f2937',
        background: '#0b0d10',
        fontSize: 13,
        color: '#d8dee9',
        overflow: 'auto',
      }}
    >
      <div
        style={{
          borderBottom: '1px solid #1f2937',
          padding: '8px 12px',
          fontSize: 11,
          letterSpacing: 0.5,
          textTransform: 'uppercase',
          color: '#6b7280',
        }}
      >
        Workspaces
      </div>
      <div style={{ padding: 8 }}>
        {workspaces.map(workspace => (
          <div key={workspace.id} style={{ marginBottom: 12 }}>
            <div
              style={{
                padding: '4px 8px',
                fontWeight: 500,
                color: '#f3f4f6',
              }}
            >
              {workspace.name}
            </div>
            {workspace.tabs.map(tab => (
              <div key={tab.id} style={{ marginLeft: 12, marginTop: 4 }}>
                <div style={{ padding: '4px 8px', color: '#9ca3af' }}>
                  {tab.name}
                </div>
                {Object.values(slabs)
                  .filter(slab => slab.tabId === tab.id)
                  .map(slab => {
                    const isActive = slab.id === activeSlabId
                    return (
                      <button
                        key={slab.id}
                        type="button"
                        onClick={() => setActiveSlab(slab.id)}
                        style={{
                          display: 'block',
                          width: '100%',
                          padding: '4px 8px',
                          textAlign: 'left',
                          background: isActive ? '#1f2937' : 'transparent',
                          color: isActive ? '#ffffff' : '#9ca3af',
                          border: 'none',
                          borderRadius: 4,
                          cursor: 'pointer',
                          fontSize: 13,
                          fontFamily: 'inherit',
                        }}
                      >
                        <span style={{ marginRight: 8 }}>
                          {statusDot(slab.status)}
                        </span>
                        {slab.name}
                      </button>
                    )
                  })}
              </div>
            ))}
          </div>
        ))}
      </div>
    </aside>
  )
}

function statusDot(status: SlabStatus): string {
  switch (status) {
    case 'running':
      return '●'
    case 'exited':
      return '○'
    case 'failed':
      return '×'
    case 'starting':
      return '◐'
    case 'idle':
    default:
      return '·'
  }
}

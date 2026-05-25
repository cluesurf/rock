import type { ReactNode } from 'react'
import { useTerminalStore } from './use-terminal-store'

/**
 * JSX sidebar primitives for `.tool/term/sidebar.tsx`.
 *
 *     // .term/sidebar.tsx
 *     import { SidebarSection, SlabButton } from '@cluesurf/term/face'
 *
 *     export default function Sidebar() {
 *       return (
 *         <>
 *           <SidebarSection title="App">
 *             <SlabButton name="web" />
 *             <SlabButton name="api" />
 *           </SidebarSection>
 *           <SidebarSection title="Infra">
 *             <SlabButton name="logs" />
 *           </SidebarSection>
 *         </>
 *       )
 *     }
 */

export type SidebarSectionProps = {
  title: string
  children: ReactNode
}

export function SidebarSection({ title, children }: SidebarSectionProps) {
  return (
    <div style={{ marginBottom: 16 }}>
      <div
        style={{
          padding: '4px 8px',
          fontSize: 11,
          letterSpacing: 0.5,
          textTransform: 'uppercase',
          color: '#6b7280',
        }}
      >
        {title}
      </div>
      <div>{children}</div>
    </div>
  )
}

export type SlabButtonProps = {
  /** Symbolic slab name from `.tool/term/workspace.ts`. */
  name: string
  /** Optional display label. Defaults to the slab name. */
  label?: string
}

export function SlabButton({ name, label }: SlabButtonProps) {
  const slabId = useTerminalStore(state => state.slabIdByName[name])
  const activeSlabId = useTerminalStore(state => state.activeSlabId)
  const setActiveSlab = useTerminalStore(state => state.setActiveSlab)
  const status = useTerminalStore(state =>
    slabId ? state.slabs[slabId]?.status : undefined,
  )

  const isActive = slabId !== undefined && slabId === activeSlabId
  const display = label ?? name

  return (
    <button
      type="button"
      disabled={!slabId}
      onClick={() => slabId && setActiveSlab(slabId)}
      style={{
        display: 'block',
        width: '100%',
        padding: '4px 8px',
        textAlign: 'left',
        background: isActive ? '#1f2937' : 'transparent',
        color: !slabId
          ? '#4b5563'
          : isActive
            ? '#ffffff'
            : '#9ca3af',
        border: 'none',
        borderRadius: 4,
        cursor: slabId ? 'pointer' : 'not-allowed',
        fontSize: 13,
        fontFamily: 'inherit',
      }}
    >
      <span style={{ marginRight: 8 }}>{statusDot(status)}</span>
      {display}
    </button>
  )
}

function statusDot(status: string | undefined): string {
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

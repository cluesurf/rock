import {
  useState,
  useEffect,
  type ReactNode,
  type MouseEvent,
} from 'react'
import { useTerminalStore } from './use-terminal-store'

/**
 * Sidebar tab tree. Composable, status-aware,
 * keyboard-navigable.
 *
 *     <Tree>
 *       <Branch label="App">
 *         <Leaf slab="web" />
 *         <Leaf slab="api" />
 *       </Branch>
 *       <Branch label="Infra">
 *         <Leaf slab="db" />
 *       </Branch>
 *     </Tree>
 */

export type TreeProps = {
  className?: string
  children: ReactNode
}

export function Tree({ className, children }: TreeProps) {
  return (
    <div data-rock-tree="" className={className} role="tree">
      {children}
    </div>
  )
}

export type BranchProps = {
  label: string
  collapsed?: boolean
  icon?: ReactNode
  actions?: ReactNode
  className?: string
  children: ReactNode
}

export function Branch({
  label,
  collapsed: initialCollapsed = false,
  icon,
  actions,
  className,
  children,
}: BranchProps) {
  const [collapsed, setCollapsed] = useState(initialCollapsed)

  return (
    <div
      data-rock-branch=""
      data-collapsed={String(collapsed)}
      className={className}
    >
      <button
        type="button"
        data-rock-branch-header=""
        onClick={() => setCollapsed(c => !c)}
      >
        <span data-rock-branch-caret="" data-collapsed={String(collapsed)}>
          {collapsed ? '▸' : '▾'}
        </span>
        {icon && <span data-rock-branch-icon="">{icon}</span>}
        <span data-rock-branch-label="">{label}</span>
        {actions && <span data-rock-branch-actions="">{actions}</span>}
      </button>
      {!collapsed && (
        <div data-rock-branch-children="">{children}</div>
      )}
    </div>
  )
}

export type LeafProps = {
  /** Symbolic slab name. If set, click focuses the slab. */
  slab?: string
  label?: string
  icon?: ReactNode
  actions?: ReactNode
  className?: string
  onClick?: (event: MouseEvent<HTMLButtonElement>) => void
  children?: ReactNode
}

export function Leaf({
  slab,
  label,
  icon,
  actions,
  className,
  onClick,
  children,
}: LeafProps) {
  const slabId = useTerminalStore(state =>
    slab ? state.slabIdByName[slab] : undefined,
  )
  const slabRecord = useTerminalStore(state =>
    slabId ? state.slabs[slabId] : undefined,
  )
  const activeSlabId = useTerminalStore(state => state.activeSlabId)
  const setActive = useTerminalStore(state => state.setActiveSlab)

  const status = slabRecord?.status ?? 'idle'
  const isActive = slabId !== undefined && slabId === activeSlabId
  const displayLabel = label ?? slab ?? '(no slab)'

  function handleClick(event: MouseEvent<HTMLButtonElement>) {
    if (onClick) return onClick(event)
    if (slabId) setActive(slabId)
  }

  return (
    <button
      type="button"
      data-rock-leaf=""
      data-active={String(isActive)}
      data-status={status}
      className={className}
      onClick={handleClick}
      role="treeitem"
    >
      {icon !== undefined ? (
        <span data-rock-leaf-icon="">{icon}</span>
      ) : (
        <span data-rock-leaf-dot="" data-status={status}>
          {statusGlyph(status)}
        </span>
      )}
      <span data-rock-leaf-label="">
        {children ?? displayLabel}
      </span>
      {actions && (
        <span data-rock-leaf-actions="" onClick={e => e.stopPropagation()}>
          {actions}
        </span>
      )}
    </button>
  )
}

function statusGlyph(status: string): string {
  switch (status) {
    case 'running':  return '●'
    case 'exited':   return '○'
    case 'failed':   return '×'
    case 'starting': return '◐'
    default:         return '·'
  }
}

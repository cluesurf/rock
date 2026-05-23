/**
 * VSCode-style sidebar tree.
 *
 *     <TreeView
 *       tree={tree}
 *       onChange={persist}
 *       onActivateLeaf={spawnAndFocus}
 *     />
 *
 * Capabilities:
 *   - read-only render with expand/collapse + status dots
 *   - keyboard nav (arrow keys, Enter, Space)
 *   - in-place rename (Enter while focused, or double-click)
 *   - Cmd+T inserts a leaf in the focused group (or root)
 *   - Cmd+Shift+G inserts a sibling group
 *   - Cmd+W / Delete removes the focused node
 *   - drag and drop via @dnd-kit (before / after / inside)
 *
 * Persistence is the consumer's job — pass an `onChange`
 * that writes to disk / IPC / storage.
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type ChangeEvent,
} from 'react'
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  closestCenter,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core'
import { useSortable, sortableKeyboardCoordinates } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import {
  appendNode,
  findNode,
  findParent,
  makeGroup,
  makeLeaf,
  moveNode,
  removeNode,
  renameNode,
  toggleCollapsed,
  visibleOrder,
  type DropPosition,
  type GroupNode,
  type LeafNode,
  type TreeNode,
} from '@/base/tree'
import { useTerminalStore } from './use-terminal-store'

export type TreeViewProps = {
  tree: TreeNode[]
  onChange: (next: TreeNode[]) => void
  /** Called when a leaf becomes active (click or kb activate). */
  onActivateLeaf?: (leaf: LeafNode) => void
  /** Called when the user wants a new tab; pass back the new
   *  slab's name. If omitted, Cmd+T does nothing. */
  onRequestNewSlab?: () => Promise<{ name: string } | null>
  className?: string
}

type RenamingState = { id: string; draft: string } | null
type DropOverState = {
  targetId: string
  position: DropPosition
} | null

export function TreeView({
  tree,
  onChange,
  onActivateLeaf,
  onRequestNewSlab,
  className,
}: TreeViewProps) {
  const [focusedId, setFocusedId] = useState<string | null>(null)
  const [renaming, setRenaming] = useState<RenamingState>(null)
  const [dragId, setDragId] = useState<string | null>(null)
  const [dropOver, setDropOver] = useState<DropOverState>(null)

  // Visible-order traversal for kb nav.
  const visible = useMemo(() => visibleOrder(tree), [tree])

  // ── Editing operations ────────────────────────────────
  const startRename = useCallback(
    (id: string) => {
      const node = findNode(tree, id)
      if (!node) return
      const current = node.kind === 'group' ? node.label : (node.label ?? node.slabName)
      setRenaming({ id, draft: current })
    },
    [tree],
  )

  const commitRename = useCallback(() => {
    if (!renaming) return
    onChange(renameNode(tree, renaming.id, renaming.draft))
    setRenaming(null)
  }, [renaming, tree, onChange])

  const cancelRename = useCallback(() => setRenaming(null), [])

  const deleteNode = useCallback(
    (id: string) => {
      const { tree: next } = removeNode(tree, id)
      onChange(next)
      setFocusedId(null)
    },
    [tree, onChange],
  )

  const insertGroupSibling = useCallback(
    (afterId: string | null) => {
      const group = makeGroup('group')
      let next: TreeNode[]
      if (afterId === null) {
        next = [...tree, group]
      } else {
        const parent = findParent(tree, afterId)
        next = appendNode(tree, group, parent?.id ?? null)
      }
      onChange(next)
      setFocusedId(group.id)
      // Auto-rename so the user can type a name immediately.
      setRenaming({ id: group.id, draft: 'group' })
    },
    [tree, onChange],
  )

  const insertNewTab = useCallback(async () => {
    if (!onRequestNewSlab) return
    const result = await onRequestNewSlab()
    if (!result) return
    const leaf = makeLeaf(result.name)
    // Insert into the focused group's children, or at root.
    let parentId: string | null = null
    if (focusedId) {
      const focused = findNode(tree, focusedId)
      if (focused?.kind === 'group') {
        parentId = focused.id
      } else if (focused) {
        const parent = findParent(tree, focused.id)
        parentId = parent?.id ?? null
      }
    }
    const next = appendNode(tree, leaf, parentId)
    onChange(next)
    setFocusedId(leaf.id)
    onActivateLeaf?.(leaf)
  }, [focusedId, tree, onChange, onRequestNewSlab, onActivateLeaf])

  // ── Activation ────────────────────────────────────────
  const activateLeaf = useCallback(
    (leaf: LeafNode) => {
      setFocusedId(leaf.id)
      onActivateLeaf?.(leaf)
    },
    [onActivateLeaf],
  )

  // ── Keyboard nav (only when focus is INSIDE the tree) ─
  // The DOM focus controls this: each row is a button, so
  // tab order works natively. We just handle Enter / Space
  // / arrow keys via the row's own onKeyDown.

  const moveFocus = useCallback(
    (delta: number) => {
      if (visible.length === 0) return
      const i = focusedId
        ? visible.findIndex(n => n.id === focusedId)
        : -1
      const next = (i + delta + visible.length) % visible.length
      setFocusedId(visible[next]!.id)
    },
    [focusedId, visible],
  )

  // ── DnD ───────────────────────────────────────────────
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  function handleDragStart(event: DragStartEvent) {
    setDragId(String(event.active.id))
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    setDragId(null)
    setDropOver(null)
    if (!over) return
    const dragId = String(active.id)
    const overId = String(over.id)
    if (dragId === overId) return
    const position = dropOver?.targetId === overId
      ? dropOver.position
      : 'after'
    onChange(moveNode(tree, dragId, overId, position))
  }

  // ── Render ───────────────────────────────────────────
  const dragNode = dragId ? findNode(tree, dragId) : null

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div data-rock-tree="" role="tree" className={className}>
        {tree.map(node => (
          <NodeRow
            key={node.id}
            node={node}
            depth={0}
            focusedId={focusedId}
            renaming={renaming}
            dropOver={dropOver}
            setFocusedId={setFocusedId}
            setDropOver={setDropOver}
            onToggleCollapse={(id) => onChange(toggleCollapsed(tree, id))}
            onActivateLeaf={activateLeaf}
            onStartRename={startRename}
            onCommitRename={commitRename}
            onCancelRename={cancelRename}
            onRenameDraft={(draft) => setRenaming(r => r ? { ...r, draft } : r)}
            onDelete={deleteNode}
            onNewTab={insertNewTab}
            onNewGroup={(afterId) => insertGroupSibling(afterId)}
            onMoveFocus={moveFocus}
          />
        ))}
      </div>
      <DragOverlay
        dropAnimation={{
          duration: 180,
          easing: 'cubic-bezier(0.18, 0.67, 0.6, 1.22)',
        }}
      >
        {dragNode ? <DragGhost node={dragNode} /> : null}
      </DragOverlay>
    </DndContext>
  )
}

// ────────────────────────────────────────────────────────
// NodeRow — recursive renderer for one tree node
// ────────────────────────────────────────────────────────

type NodeRowProps = {
  node: TreeNode
  depth: number
  focusedId: string | null
  renaming: RenamingState
  dropOver: DropOverState
  setFocusedId: (id: string | null) => void
  setDropOver: (s: DropOverState) => void
  onToggleCollapse: (id: string) => void
  onActivateLeaf: (leaf: LeafNode) => void
  onStartRename: (id: string) => void
  onCommitRename: () => void
  onCancelRename: () => void
  onRenameDraft: (draft: string) => void
  onDelete: (id: string) => void
  onNewTab: () => void
  onNewGroup: (afterId: string | null) => void
  onMoveFocus: (delta: number) => void
}

function NodeRow(props: NodeRowProps) {
  const { node } = props
  if (node.kind === 'group') {
    return <GroupRow {...props} node={node} />
  }
  return <LeafRow {...props} node={node} />
}

// ────────────────────────────────────────────────────────
// GroupRow
// ────────────────────────────────────────────────────────

function GroupRow(props: NodeRowProps & { node: GroupNode }) {
  const {
    node,
    depth,
    focusedId,
    renaming,
    dropOver,
    setFocusedId,
    setDropOver,
    onToggleCollapse,
    onStartRename,
    onCommitRename,
    onCancelRename,
    onRenameDraft,
    onDelete,
    onNewTab,
    onNewGroup,
    onMoveFocus,
  } = props
  const isFocused = focusedId === node.id
  const isRenaming = renaming?.id === node.id
  const isDropTarget = dropOver?.targetId === node.id

  const sortable = useSortable({ id: node.id })
  const isDragging = sortable.isDragging

  function handleKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      onMoveFocus(+1)
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      onMoveFocus(-1)
    } else if (event.key === 'ArrowRight') {
      event.preventDefault()
      if (node.collapsed) onToggleCollapse(node.id)
    } else if (event.key === 'ArrowLeft') {
      event.preventDefault()
      if (!node.collapsed) onToggleCollapse(node.id)
    } else if (event.key === ' ') {
      event.preventDefault()
      onToggleCollapse(node.id)
    } else if (event.key === 'Enter') {
      event.preventDefault()
      onStartRename(node.id)
    } else if (
      (event.metaKey || event.ctrlKey) &&
      event.key.toLowerCase() === 't'
    ) {
      event.preventDefault()
      onNewTab()
    } else if (
      (event.metaKey || event.ctrlKey) &&
      event.shiftKey &&
      event.key.toLowerCase() === 'g'
    ) {
      event.preventDefault()
      onNewGroup(node.id)
    } else if (
      (event.metaKey || event.ctrlKey) &&
      event.key.toLowerCase() === 'w'
    ) {
      event.preventDefault()
      onDelete(node.id)
    }
  }

  function handleDragOver(event: React.DragEvent<HTMLDivElement>) {
    // dnd-kit owns the actual drag; we just set hint state
    // for the inside-vs-around drop position.
    const rect = event.currentTarget.getBoundingClientRect()
    const y = event.clientY - rect.top
    const h = rect.height
    let position: DropPosition = 'inside'
    if (y < h * 0.25) position = 'before'
    else if (y > h * 0.75) position = 'after'
    setDropOver({ targetId: node.id, position })
  }

  return (
    <div ref={sortable.setNodeRef} style={{
      transform: CSS.Transform.toString(sortable.transform),
      transition: sortable.transition,
    }}>
      <div
        {...sortable.attributes}
        {...sortable.listeners}
        data-rock-branch=""
        data-collapsed={String(node.collapsed)}
        data-focused={String(isFocused)}
        data-dragging={String(isDragging)}
        data-drop={isDropTarget ? dropOver.position : ''}
        tabIndex={0}
        role="treeitem"
        aria-expanded={!node.collapsed}
        onKeyDown={handleKeyDown}
        onFocus={() => setFocusedId(node.id)}
        onDragOver={handleDragOver}
        onDragLeave={() => setDropOver(null)}
      >
        <div
          data-rock-branch-header=""
          style={{ paddingLeft: 8 + depth * 12 }}
          onClick={(e) => {
            // Click the chevron area or label both toggle.
            if (!isRenaming) onToggleCollapse(node.id)
            e.stopPropagation()
          }}
          onDoubleClick={(e) => {
            e.stopPropagation()
            onStartRename(node.id)
          }}
        >
          <span data-rock-branch-caret="" data-collapsed={String(node.collapsed)}>
            {node.collapsed ? '▸' : '▾'}
          </span>
          {isRenaming ? (
            <RenameInput
              draft={renaming!.draft}
              onChange={onRenameDraft}
              onCommit={onCommitRename}
              onCancel={onCancelRename}
            />
          ) : (
            <span data-rock-branch-label="">{node.label}</span>
          )}
          <GroupStatusBadge group={node} />
        </div>
      </div>
      {!node.collapsed && (
        <div data-rock-branch-children="">
          {node.children.map(child => (
            <NodeRow {...props} key={child.id} node={child} depth={depth + 1} />
          ))}
        </div>
      )}
    </div>
  )
}

// ────────────────────────────────────────────────────────
// LeafRow
// ────────────────────────────────────────────────────────

function LeafRow(props: NodeRowProps & { node: LeafNode }) {
  const {
    node,
    depth,
    focusedId,
    renaming,
    dropOver,
    setFocusedId,
    setDropOver,
    onActivateLeaf,
    onStartRename,
    onCommitRename,
    onCancelRename,
    onRenameDraft,
    onDelete,
    onNewTab,
    onNewGroup,
    onMoveFocus,
  } = props

  const slabId = useTerminalStore(s => s.slabIdByName[node.slabName])
  const slabRecord = useTerminalStore(s =>
    slabId ? s.slabs[slabId] : undefined,
  )
  const activeSlabId = useTerminalStore(s => s.activeSlabId)
  const status = slabRecord?.status ?? 'idle'
  const isActive = slabId !== undefined && slabId === activeSlabId
  const isFocused = focusedId === node.id
  const isRenaming = renaming?.id === node.id
  const isDropTarget = dropOver?.targetId === node.id
  const displayLabel = node.label ?? node.slabName

  const sortable = useSortable({ id: node.id })
  const isDragging = sortable.isDragging

  function handleKeyDown(event: ReactKeyboardEvent<HTMLButtonElement>) {
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      onMoveFocus(+1)
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      onMoveFocus(-1)
    } else if (event.key === 'Enter') {
      event.preventDefault()
      if (isFocused && !isActive) onActivateLeaf(node)
      else onStartRename(node.id)
    } else if (
      (event.metaKey || event.ctrlKey) &&
      event.key.toLowerCase() === 't'
    ) {
      event.preventDefault()
      onNewTab()
    } else if (
      (event.metaKey || event.ctrlKey) &&
      event.shiftKey &&
      event.key.toLowerCase() === 'g'
    ) {
      event.preventDefault()
      onNewGroup(node.id)
    } else if (
      (event.metaKey || event.ctrlKey) &&
      event.key.toLowerCase() === 'w'
    ) {
      event.preventDefault()
      onDelete(node.id)
    }
  }

  function handleDragOver(event: React.DragEvent<HTMLButtonElement>) {
    const rect = event.currentTarget.getBoundingClientRect()
    const y = event.clientY - rect.top
    const h = rect.height
    const position: DropPosition = y < h / 2 ? 'before' : 'after'
    setDropOver({ targetId: node.id, position })
  }

  if (isRenaming) {
    return (
      <div
        ref={sortable.setNodeRef}
        data-rock-leaf=""
        style={{
          paddingLeft: 8 + depth * 12,
          transform: CSS.Transform.toString(sortable.transform),
          transition: sortable.transition,
        }}
      >
        <RenameInput
          draft={renaming!.draft}
          onChange={onRenameDraft}
          onCommit={onCommitRename}
          onCancel={onCancelRename}
        />
      </div>
    )
  }

  return (
    <button
      type="button"
      ref={sortable.setNodeRef as unknown as React.RefObject<HTMLButtonElement>}
      {...sortable.attributes}
      {...sortable.listeners}
      data-rock-leaf=""
      data-active={String(isActive)}
      data-focused={String(isFocused)}
      data-dragging={String(isDragging)}
      data-drop={isDropTarget ? dropOver.position : ''}
      data-status={status}
      style={{
        paddingLeft: 8 + depth * 12,
        transform: CSS.Transform.toString(sortable.transform),
        transition: sortable.transition,
      }}
      onClick={() => onActivateLeaf(node)}
      onDoubleClick={() => onStartRename(node.id)}
      onKeyDown={handleKeyDown}
      onFocus={() => setFocusedId(node.id)}
      onDragOver={handleDragOver}
      onDragLeave={() => setDropOver(null)}
    >
      <span data-rock-leaf-label="">{displayLabel}</span>
      <LeafStatusDot status={status} />
    </button>
  )
}

// ────────────────────────────────────────────────────────
// Small bits
// ────────────────────────────────────────────────────────

function RenameInput({
  draft,
  onChange,
  onCommit,
  onCancel,
}: {
  draft: string
  onChange: (s: string) => void
  onCommit: () => void
  onCancel: () => void
}) {
  const ref = useRef<HTMLInputElement | null>(null)
  useEffect(() => {
    ref.current?.focus()
    ref.current?.select()
  }, [])

  return (
    <input
      ref={ref}
      data-rock-rename=""
      value={draft}
      onChange={(e: ChangeEvent<HTMLInputElement>) => onChange(e.target.value)}
      onBlur={onCommit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault()
          onCommit()
        } else if (e.key === 'Escape') {
          e.preventDefault()
          onCancel()
        }
      }}
      onClick={(e: ReactMouseEvent) => e.stopPropagation()}
      spellCheck={false}
    />
  )
}

function LeafStatusDot({ status }: { status: string }) {
  const map: Record<string, string> = {
    running:  '●',
    starting: '◐',
    exited:   '○',
    failed:   '✕',
    idle:     '',
  }
  const char = map[status] ?? ''
  if (!char) return null
  return (
    <span data-rock-leaf-dot="" data-status={status} aria-label={status}>
      {char}
    </span>
  )
}

function GroupStatusBadge({ group }: { group: GroupNode }) {
  const slabIdByName = useTerminalStore(s => s.slabIdByName)
  const slabs = useTerminalStore(s => s.slabs)
  const { total, running } = useMemo(() => {
    let t = 0
    let r = 0
    function walk(nodes: TreeNode[]) {
      for (const n of nodes) {
        if (n.kind === 'group') walk(n.children)
        else {
          t += 1
          const id = slabIdByName[n.slabName]
          if (id && slabs[id]?.status === 'running') r += 1
        }
      }
    }
    walk(group.children)
    return { total: t, running: r }
  }, [group, slabIdByName, slabs])
  if (total === 0) return null
  const label = running > 0 ? `${running}/${total}` : `${total}`
  return (
    <span data-rock-branch-count="" aria-label={`${total} items, ${running} running`}>
      {label}
    </span>
  )
}

function DragGhost({ node }: { node: TreeNode }) {
  const label = node.kind === 'group'
    ? node.label
    : (node.label ?? node.slabName)
  const icon = node.kind === 'group' ? '▾' : ''
  return (
    <div
      data-rock-tree-ghost=""
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        padding: '4px 10px',
        background: 'var(--rock-active-bg, #3f3f46)',
        color: 'var(--rock-fg, #e4e4e7)',
        borderRadius: 4,
        fontSize: 13,
        fontFamily: 'var(--rock-font, ui-monospace, monospace)',
        // Visible ring + drop shadow so the ghost reads as
        // "lifted" against any background.
        boxShadow:
          '0 0 0 1px var(--rock-accent, #8b5cf6), 0 6px 16px rgba(0,0,0,0.45)',
        // Slight tilt for visual lift — matches the
        // "I'm being moved" affordance.
        transform: 'rotate(-1deg) scale(1.02)',
        cursor: 'grabbing',
        pointerEvents: 'none',
        whiteSpace: 'nowrap',
      }}
    >
      {icon && <span style={{ opacity: 0.6 }}>{icon}</span>}
      <span>{label}</span>
    </div>
  )
}

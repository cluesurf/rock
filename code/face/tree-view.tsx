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
  type DragOverEvent,
  type DragStartEvent,
} from '@dnd-kit/core'
import { useSortable, sortableKeyboardCoordinates } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import {
  appendNode,
  findNode,
  findParent,
  flattenLeaves,
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
import { useSlabActivity, useCommandDuration } from './use-slab-activity'

export type TreeViewProps = {
  tree: TreeNode[]
  onChange: (next: TreeNode[]) => void
  /** Called when a leaf becomes active (click or kb activate). */
  onActivateLeaf?: (leaf: LeafNode) => void
  /** Called when the user wants a new tab; pass back the new
   *  slab's name. If omitted, Cmd+T does nothing. */
  onRequestNewSlab?: () => Promise<{ name: string } | null>
  /** Called for EACH leaf that gets removed (single leaf
   *  delete, or every leaf inside a deleted group). Use this
   *  to kill the underlying slab process. */
  onDeleteLeaf?: (leaf: LeafNode) => void
  className?: string
}

type RenamingState = { id: string; draft: string } | null
type DropOverState = {
  targetId: string
  position: DropPosition
} | null

/** Sentinel id for the empty space below the last row.
 *  Dropping on this appends the dragged node to root. */
const END_DROP_ID = '__rock_tree_end__'

/** Walk the tree, collecting every group's label into `out`.
 *  Used to pick an unused default name for new groups. */
function collectGroupLabels(tree: TreeNode[], out: Set<string>): void {
  for (const node of tree) {
    if (node.kind === 'group') {
      out.add(node.label)
      collectGroupLabels(node.children, out)
    }
  }
}

export function TreeView({
  tree,
  onChange,
  onActivateLeaf,
  onRequestNewSlab,
  onDeleteLeaf,
  className,
}: TreeViewProps) {
  const [focusedId, setFocusedId] = useState<string | null>(null)
  const [renaming, setRenaming] = useState<RenamingState>(null)
  const [dragId, setDragId] = useState<string | null>(null)
  const [dropOver, setDropOver] = useState<DropOverState>(null)
  const rootRef = useRef<HTMLDivElement | null>(null)

  // Clear focus when user clicks anywhere outside the tree
  // (sidebar background, terminal, etc.). The visual focus
  // ring tracks focusedId, so this also clears the ring.
  useEffect(() => {
    function onPointerDown(event: PointerEvent) {
      const root = rootRef.current
      if (!root) return
      const target = event.target as Node | null
      if (target && root.contains(target)) return
      setFocusedId(null)
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
    }
  }, [])

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
      const { tree: next, removed } = removeNode(tree, id)
      if (removed && onDeleteLeaf) {
        // Fire for every leaf descendant (one for a leaf,
        // many for a group) so the consumer can kill each
        // slab's underlying PTY.
        const leaves =
          removed.kind === 'leaf' ? [removed] : flattenLeaves([removed])
        for (const leaf of leaves) onDeleteLeaf(leaf)
      }
      onChange(next)
      setFocusedId(null)
    },
    [tree, onChange, onDeleteLeaf],
  )

  const insertGroupSibling = useCallback(
    (afterId: string | null) => {
      // Auto-name: first group is `group`, then `group-2`,
      // `group-3`, etc. Don't reuse a label already taken.
      const used = new Set<string>()
      collectGroupLabels(tree, used)
      let label = 'group'
      let n = 2
      while (used.has(label)) {
        label = `group-${n}`
        n += 1
      }
      const group = makeGroup(label)
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
      setRenaming({ id: group.id, draft: label })
    },
    [tree, onChange],
  )

  const insertNewTab = useCallback(async () => {
    if (!onRequestNewSlab) return
    const result = await onRequestNewSlab()
    if (!result) return
    const leaf = makeLeaf(result.name)
    // Always a SIBLING of the focused node — never inside
    // a group. If focused is null, append to root. To put
    // a leaf INSIDE a group, drag it in.
    let parentId: string | null = null
    if (focusedId) {
      const parent = findParent(tree, focusedId)
      parentId = parent?.id ?? null
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
      const nextId = visible[next]!.id
      setFocusedId(nextId)
      // Move actual DOM focus too so subsequent keys
      // (arrow / Enter / Cmd+T / etc.) fire on the new
      // row's handler, not the previous row's.
      requestAnimationFrame(() => {
        const el = rootRef.current?.querySelector(
          `[data-rock-node-id="${nextId}"]`,
        ) as HTMLElement | null
        el?.focus()
      })
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

  /**
   * dnd-kit uses pointer events (not native HTML5 drag),
   * so we compute the drop position from rect geometry here
   * instead of native onDragOver handlers on the row. Sets
   * dropOver state so the row's data-drop attribute gives
   * the CSS indicator (line above/below for sibling drops,
   * tint for inside-group drops).
   */
  function handleDragOver(event: DragOverEvent) {
    const { active, over } = event
    if (!over) {
      setDropOver(null)
      return
    }
    const overId = String(over.id)
    if (overId === String(active.id)) {
      setDropOver(null)
      return
    }
    const activeRect = active.rect.current.translated
    const overRect = over.rect
    if (!activeRect) {
      setDropOver(null)
      return
    }
    const activeCenter = activeRect.top + activeRect.height / 2
    const overTop = overRect.top
    const overHeight = overRect.height

    const overNode = findNode(tree, overId)
    // Groups: the registered drop target is the group's
    // HEADER only (children render below in their own
    // sortable rows). So any cursor-over-header = "drop
    // INSIDE this group". Anything above/below the header
    // is intercepted by sibling rows.
    if (overNode?.kind === 'group') {
      setDropOver({ targetId: overId, position: 'inside' })
      return
    }

    // Leaves: simple before/after split at the midpoint.
    const position: DropPosition =
      activeCenter < overTop + overHeight / 2 ? 'before' : 'after'
    setDropOver({ targetId: overId, position })
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    const stagedDrop = dropOver
    setDragId(null)
    setDropOver(null)
    setFocusedId(null)
    const dragId = String(active.id)
    // Tail sentinel (or no over at all) — append to root.
    // The "no over" case happens when the cursor leaves
    // every sortable item's rect (eg. dropped far below
    // the last row, into empty space). Append-to-root is
    // the most useful interpretation.
    if (!over || String(over.id) === END_DROP_ID) {
      const dragNode = findNode(tree, dragId)
      if (!dragNode) return
      const { tree: withoutDrag } = removeNode(tree, dragId)
      onChange([...withoutDrag, dragNode])
      return
    }
    const overId = String(over.id)
    if (dragId === overId) return
    const position = stagedDrop?.targetId === overId
      ? stagedDrop.position
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
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
    >
      <div
        ref={rootRef}
        data-rock-tree=""
        role="tree"
        className={className}
      >
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
        {/* Tail drop zone — catches drags past the last
            visible row. Without this, dnd-kit's collision
            detection finds nothing under the cursor when
            you drag below the list, so the drop is a no-op
            (you can never reach "end of root"). */}
        <TailDropZone visible={dragId !== null} />
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

/**
 * Invisible-but-present drop target at the end of the tree.
 * Only renders meaningfully during a drag so it doesn't
 * occupy clickable space at rest.
 */
function TailDropZone({ visible }: { visible: boolean }) {
  const sortable = useSortable({ id: END_DROP_ID })
  // Whether dnd-kit currently picks THIS as the over
  // target. We use it to show the drop indicator line.
  const isOver = sortable.isOver
  return (
    <div
      ref={sortable.setNodeRef}
      data-rock-tree-tail=""
      data-active={String(visible)}
      data-drop={isOver ? 'after' : ''}
      style={{
        position: 'relative',
        minHeight: visible ? 200 : 8,
        width: '100%',
      }}
    />
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
    // Helper — preventDefault + stopPropagation so global
    // Keys bindings on window don't double-fire when the
    // tree handles the key.
    const handled = () => {
      event.preventDefault()
      event.stopPropagation()
    }
    if (event.key === 'ArrowDown') {
      handled()
      onMoveFocus(+1)
    } else if (event.key === 'ArrowUp') {
      handled()
      onMoveFocus(-1)
    } else if (event.key === 'ArrowRight') {
      handled()
      if (node.collapsed) onToggleCollapse(node.id)
    } else if (event.key === 'ArrowLeft') {
      handled()
      if (!node.collapsed) onToggleCollapse(node.id)
    } else if (event.key === ' ') {
      handled()
      onToggleCollapse(node.id)
    } else if (event.key === 'Enter') {
      handled()
      onStartRename(node.id)
    } else if (
      (event.metaKey || event.ctrlKey) &&
      event.key.toLowerCase() === 't'
    ) {
      handled()
      onNewTab()
    } else if (
      (event.metaKey || event.ctrlKey) &&
      event.shiftKey &&
      event.key.toLowerCase() === 'g'
    ) {
      handled()
      onNewGroup(node.id)
    } else if (
      (event.metaKey || event.ctrlKey) &&
      (event.key.toLowerCase() === 'w' ||
        event.key === 'Backspace' ||
        event.key === 'Delete')
    ) {
      handled()
      onDelete(node.id)
    }
  }

  return (
    <div
      data-rock-branch=""
      data-collapsed={String(node.collapsed)}
      data-focused={String(isFocused)}
      data-dragging={String(isDragging)}
      data-drop={isDropTarget ? dropOver.position : ''}
    >
      {/* Header is the drop target. Registering setNodeRef
          here (not on the outer div) means dnd-kit's
          collision detection measures only the header's
          rect — so "inside" drops can fire when the
          cursor is on the header, not on a child row. */}
      <div
        ref={sortable.setNodeRef}
        {...sortable.attributes}
        {...sortable.listeners}
        data-rock-branch-header=""
        data-rock-node-id={node.id}
        tabIndex={0}
        role="treeitem"
        aria-expanded={!node.collapsed}
        style={{
          paddingLeft: 12 + depth * 12,
        paddingRight: 12,
          transform: CSS.Transform.toString(sortable.transform),
          transition: sortable.transition,
        }}
        onKeyDown={handleKeyDown}
        onFocus={() => setFocusedId(node.id)}
        onClick={(e) => {
          if (!isRenaming) onToggleCollapse(node.id)
          e.stopPropagation()
        }}
        /* No double-click → rename. Press Enter on a
           focused row to rename. Click only toggles
           collapse / selects. */
      >
        {isRenaming ? (
          <RenameInput
            draft={renaming!.draft}
            onChange={onRenameDraft}
            onCommit={onCommitRename}
            onCancel={onCancelRename}
          />
        ) : (
          <>
            <span data-rock-branch-label="">{node.label}</span>
            {/* Collapse state indicator — subtle right/down
                caret AFTER the label so it doesn't compete
                with the indent. Faint vs the label so it
                reads as supplemental. */}
            <span
              data-rock-branch-caret=""
              data-collapsed={String(node.collapsed)}
              aria-hidden
            >
              {node.collapsed ? '▸' : '▾'}
            </span>
          </>
        )}
        {/* GroupStatusBadge intentionally omitted from the
            default chrome — felt noisy. Re-enable here if
            we want it: <GroupStatusBadge group={node} /> */}
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

  // Notify when a long-running command finishes. Skipped
  // when the leaf is currently focused — if you're watching
  // it, you don't need a notification. Notifications
  // require the user to grant permission once
  // (base.tsx does that on mount).
  useCommandDuration(slabId, {
    thresholdMs: 5000,
    onComplete: (durationMs) => {
      if (isActive || document.hidden === false && isActive) return
      if (typeof Notification === 'undefined') return
      if (Notification.permission !== 'granted') return
      try {
        const secs = (durationMs / 1000).toFixed(1)
        new Notification(`${displayLabel} finished`, {
          body: `Command ran for ${secs}s`,
          silent: false,
        })
      } catch {
        /* notification rate-limit or other browser quirk */
      }
    },
  })

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
      event.stopPropagation()
      if (isFocused && !isActive) onActivateLeaf(node)
      else onStartRename(node.id)
    } else if (event.key === 'Tab' && !event.shiftKey) {
      // Tab from a focused leaf → jump to the terminal so
      // the user can start typing. xterm's input is a
      // hidden <textarea class="xterm-helper-textarea">
      // inside the ready Dock.
      event.preventDefault()
      event.stopPropagation()
      const xtermTextarea = document.querySelector(
        '[data-rock-dock][data-ready="true"] .xterm-helper-textarea',
      ) as HTMLTextAreaElement | null
      xtermTextarea?.focus()
    } else if (
      (event.metaKey || event.ctrlKey) &&
      event.key.toLowerCase() === 't'
    ) {
      event.preventDefault()
      event.stopPropagation()
      onNewTab()
    } else if (
      (event.metaKey || event.ctrlKey) &&
      event.shiftKey &&
      event.key.toLowerCase() === 'g'
    ) {
      event.preventDefault()
      event.stopPropagation()
      onNewGroup(node.id)
    } else if (
      (event.metaKey || event.ctrlKey) &&
      event.key.toLowerCase() === 'w'
    ) {
      event.preventDefault()
      onDelete(node.id)
    }
  }

  if (isRenaming) {
    return (
      <div
        ref={sortable.setNodeRef}
        data-rock-leaf=""
        style={{
          paddingLeft: 12 + depth * 12,
        paddingRight: 12,
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
      data-rock-node-id={node.id}
      data-active={String(isActive)}
      data-focused={String(isFocused)}
      data-dragging={String(isDragging)}
      data-drop={isDropTarget ? dropOver.position : ''}
      data-status={status}
      style={{
        paddingLeft: 12 + depth * 12,
        paddingRight: 12,
        transform: CSS.Transform.toString(sortable.transform),
        transition: sortable.transition,
      }}
      onClick={() => onActivateLeaf(node)}
      onDoubleClick={() => onStartRename(node.id)}
      onKeyDown={handleKeyDown}
      onFocus={() => setFocusedId(node.id)}
    >
      <span data-rock-leaf-label="">{displayLabel}</span>
      <LeafStatusDot status={status} slabId={slabId} />
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
        // Stop EVERY key from bubbling to the parent row.
        // Without this, Enter / Escape / arrow keys would
        // ALSO fire the row's handler — re-entering rename
        // mode and blowing away the user's edits.
        e.stopPropagation()
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

/**
 * Picks the right indicator glyph from the slab's status
 * + recent activity:
 *
 *   busy (data flowing)   ◉  pulsing dot (more visible than ⋯ ellipsis)
 *   running, no output    ●  solid dot
 *   waiting (long idle)   ◌  ring — running but quiet
 *   starting              ◐  half circle
 *   exited                ○  empty circle
 *   failed                ✕  cross
 *   idle (no shell yet)   (none)
 */
function LeafStatusDot({
  status,
  slabId,
}: {
  status: string
  slabId: string | undefined
}) {
  const { busy, lastActiveAt } = useSlabActivity(slabId)

  // Filter brief activity blips out — only flip to "busy"
  // when it's been continuously busy for 300ms. Single
  // focus-event data bursts and other <300ms transients
  // don't trigger the glyph change.
  const stableBusy = useStable(busy, 300)

  // Tick every 3s while not-busy + running so "waiting"
  // re-evaluates against the clock.
  const [, setTick] = useState(0)
  useEffect(() => {
    if (stableBusy || status !== 'running') return
    const id = setInterval(() => setTick(t => t + 1), 3000)
    return () => clearInterval(id)
  }, [stableBusy, status])

  // Hold the glyph hidden for 500ms after this leaf first
  // mounts. Fades in over 200ms via CSS transition. Hides
  // the brief render-cycle flashes the user sees on click.
  const [hasMounted, setHasMounted] = useState(false)
  useEffect(() => {
    const t = setTimeout(() => setHasMounted(true), 500)
    return () => clearTimeout(t)
  }, [])

  const now = Date.now()
  const quietFor =
    lastActiveAt != null ? now - lastActiveAt : Infinity
  const isWaiting =
    !stableBusy && status === 'running' && quietFor > 10000

  let char = ''
  let dataStatus = status
  if (stableBusy && (status === 'running' || status === 'starting' || status === 'idle')) {
    char = '◉'
    dataStatus = 'busy'
  } else if (isWaiting) {
    // … (single-char ellipsis, U+2026). Reads as
    // "process is doing something, just no recent output."
    char = '…'
    dataStatus = 'waiting'
  } else {
    const map: Record<string, string> = {
      running:  '●',
      starting: '◐',
      exited:   '○',
      failed:   '✕',
      idle:     '',
    }
    char = map[status] ?? ''
  }

  if (!char) return null
  return (
    <span
      data-rock-leaf-dot=""
      data-status={dataStatus}
      aria-label={dataStatus}
      style={{
        opacity: hasMounted ? 1 : 0,
        transition: 'opacity 200ms ease-in',
      }}
    >
      {char}
    </span>
  )
}

/**
 * Returns `value` only after it has been continuously
 * true for `ms` milliseconds. Drops back to false
 * immediately. Used to filter brief activity blips.
 */
function useStable(value: boolean, ms: number): boolean {
  const [stable, setStable] = useState(false)
  useEffect(() => {
    if (!value) {
      setStable(false)
      return
    }
    const t = setTimeout(() => setStable(true), ms)
    return () => clearTimeout(t)
  }, [value, ms])
  return stable
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

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
  pointerWithin,
  rectIntersection,
  MeasuringStrategy,
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
  insertNodeAfter,
  makeGroup,
  makeLeaf,
  moveNode,
  prependChild,
  removeNode,
  renameNode,
  setCollapsedDeep,
  toggleCollapsed,
  visibleOrder,
  type DropPosition,
  type GroupNode,
  type LeafNode,
  type TreeNode,
} from '@/base/tree'
import { useTerminalStore } from './use-terminal-store'
import { useTerminalApi } from './terminal-api'
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

  // Sync focusedId to whichever leaf maps to the active
  // slab. Without this, programmatic navigation (Cmd+P
  // palette, Cmd+Shift+] cycle, anything that calls
  // setActiveSlab without DOM-focusing the corresponding
  // leaf button) leaves the previously-clicked leaf still
  // showing the "selected" bg + ring while the active row
  // is marked with the violet accent bar — two visually-
  // selected rows at once. Tying focusedId to activeSlabId
  // here keeps the sidebar honest about there being only
  // one selection.
  const activeSlabId = useTerminalStore(s => s.activeSlabId)
  const slabIdByName = useTerminalStore(s => s.slabIdByName)
  useEffect(() => {
    if (!activeSlabId) return
    const slabName = Object.keys(slabIdByName).find(
      n => slabIdByName[n] === activeSlabId,
    )
    if (!slabName) return
    const leaf = flattenLeaves(tree).find(l => l.slabName === slabName)
    if (leaf) setFocusedId(leaf.id)
  }, [activeSlabId, slabIdByName, tree])

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

  // Return DOM focus to the row after commit/cancel so
  // the user can press Enter again to re-enter rename
  // mode without clicking. Without this, the input
  // unmounts → focus falls to <body> → Enter does
  // nothing → users have to click the row first to make
  // Enter work again.
  const refocusRow = useCallback((id: string) => {
    requestAnimationFrame(() => {
      const el = rootRef.current?.querySelector(
        `[data-rock-node-id="${id}"]`,
      ) as HTMLElement | null
      el?.focus()
    })
  }, [])

  const commitRename = useCallback(() => {
    if (!renaming) return
    const id = renaming.id
    onChange(renameNode(tree, renaming.id, renaming.draft))
    setRenaming(null)
    refocusRow(id)
  }, [renaming, tree, onChange, refocusRow])

  const cancelRename = useCallback(() => {
    const id = renaming?.id
    setRenaming(null)
    if (id) refocusRow(id)
  }, [renaming, refocusRow])

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

  // Decide where to drop a freshly-created node based on
  // the user's current selection. Rules:
  //   focused = group → FIRST CHILD of the group (and
  //     expand the group so the new node is visible).
  //   focused = leaf  → SIBLING immediately AFTER the leaf.
  //   focused = null  → append at root.
  // Same rules apply whether the new node is a leaf or a
  // group, so insertGroupSibling and insertNewTab share
  // them.
  const insertAtSelection = useCallback(
    (node: TreeNode): TreeNode[] => {
      if (focusedId === null) return [...tree, node]
      const target = findNode(tree, focusedId)
      if (!target) return [...tree, node]
      if (target.kind === 'group') {
        return prependChild(tree, node, target.id)
      }
      return insertNodeAfter(tree, node, target.id)
    },
    [tree, focusedId],
  )

  const insertGroupSibling = useCallback(
    () => {
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
      const next = insertAtSelection(group)
      onChange(next)
      // Leave the new group SELECTED (focused) but not in
      // rename mode. The user can press Enter to start
      // editing its name. Going straight into rename made
      // it easy to accidentally lose the auto-name by
      // hitting a stray key.
      setFocusedId(group.id)
      // Move DOM focus to the new row so Enter / arrows
      // act on it instead of the previously-focused row.
      requestAnimationFrame(() => {
        const el = rootRef.current?.querySelector(
          `[data-rock-node-id="${group.id}"]`,
        ) as HTMLElement | null
        el?.focus()
      })
    },
    [tree, onChange, insertAtSelection],
  )

  const insertNewTab = useCallback(async () => {
    if (!onRequestNewSlab) return
    const result = await onRequestNewSlab()
    if (!result) return
    const leaf = makeLeaf(result.name)
    const next = insertAtSelection(leaf)
    onChange(next)
    // Sidebar: select the new row so the violet ring
    // appears + Enter starts rename. DOM focus moves to
    // the row so keystrokes target it instead of the
    // previously-focused element.
    setFocusedId(leaf.id)
    requestAnimationFrame(() => {
      const el = rootRef.current?.querySelector(
        `[data-rock-node-id="${leaf.id}"]`,
      ) as HTMLElement | null
      el?.focus()
    })
    // Also surface the terminal in the main pane.
    // onActivateLeaf switches the active slab tab via the
    // host shell. The new slab's PTY was already spawned
    // with the project root cwd (host wires defaultCwd
    // through to manager.createSlab), so it starts where
    // Rock was launched.
    onActivateLeaf?.(leaf)
  }, [tree, onChange, onRequestNewSlab, onActivateLeaf, insertAtSelection])

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
    // Groups: hovering over a group header is over-
    // whelmingly "drop INTO this group" intent. Treat it
    // that way by default. The ONLY exception is a
    // narrow 4px strip at the very top of the header,
    // which means "drop as sibling ABOVE this group" so
    // the user can still reach that position.
    //
    // We deliberately DON'T have an 'after group' edge
    // band: it was a landmine that fired any time the
    // cursor was near the bottom of the header, and the
    // user has no good way to predict its exact size.
    // To drop AFTER a group, the user drops onto the
    // next visible row with position 'before' — same
    // result, obvious visual feedback.
    if (overNode?.kind === 'group') {
      const offset = activeCenter - overTop
      const TOP_EDGE = 4
      const position: DropPosition =
        offset < TOP_EDGE ? 'before' : 'inside'
      setDropOver({ targetId: overId, position })
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
    const next = moveNode(tree, dragId, overId, position)
    // moveNode returns the same array reference if the
    // move is a no-op (e.g. moving a leaf to where it
    // already is). Skip the onChange so we don't fire a
    // pointless re-render + persist.
    if (next === tree) return
    onChange(next)
  }

  // ── Render ───────────────────────────────────────────
  const dragNode = dragId ? findNode(tree, dragId) : null

  return (
    <DndContext
      sensors={sensors}
      // pointerWithin finds the sortable whose rect
      // contains the cursor — direct mapping from "where
      // is the user pointing" to "which row". closestCenter
      // (the old setting) used the dragged item's center,
      // which drifts away from the cursor as soon as the
      // user grabs a row at a corner or moves quickly,
      // and produced "the drop landed on the wrong row"
      // surprises. Fall back to rectIntersection when
      // pointerWithin yields nothing (cursor just outside
      // any rect — happens at row gaps).
      collisionDetection={(args) => {
        const hits = pointerWithin(args)
        return hits.length > 0 ? hits : rectIntersection(args)
      }}
      // Force dnd-kit to remeasure sortable rects on
      // every drag (not just on first mount). Without
      // this, after the tree mutates (a drop reorders
      // items), the next drag uses the OLD rects from
      // before the mutation — so drops land based on
      // where rows USED to be. Switching apps and back
      // works around it because the focus/blur cycle
      // forces a layout flush + remeasure; we shouldn't
      // require the user to know that trick.
      measuring={{
        droppable: { strategy: MeasuringStrategy.Always },
      }}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
    >
      <div
        ref={rootRef}
        data-rock-tree=""
        role="tree"
        className={className}
        // Click on the tree's blank area (NOT a row) →
        // deselect. We use `event.target === rootRef.current`
        // to detect "click landed on the container itself,
        // not bubbled from a child row". Combined with the
        // blur below, this exits the tree's keyboard
        // context so global Cmd+→ / Cmd+← (expand-all /
        // collapse-all) can fire.
        onMouseDown={(event) => {
          if (event.target === rootRef.current) {
            setFocusedId(null)
            if (document.activeElement instanceof HTMLElement) {
              document.activeElement.blur()
            }
          }
        }}
        // Escape from any row → deselect + blur. Row-level
        // handleKeyDown's only stop propagation on keys
        // they explicitly handle, so Escape bubbles up to
        // here cleanly. After this, document.activeElement
        // is no longer inside [data-rock-tree], so the
        // global Cmd+→ / Cmd+← bindings in the host shell
        // fire (they guard on tree containment).
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.preventDefault()
            event.stopPropagation()
            setFocusedId(null)
            if (document.activeElement instanceof HTMLElement) {
              document.activeElement.blur()
            }
          }
        }}
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
            onSetCollapsedDeep={(id, collapsed) =>
              onChange(setCollapsedDeep(tree, id, collapsed))
            }
            onActivateLeaf={activateLeaf}
            onStartRename={startRename}
            onCommitRename={commitRename}
            onCancelRename={cancelRename}
            onRenameDraft={(draft) => setRenaming(r => r ? { ...r, draft } : r)}
            onDelete={deleteNode}
            onNewTab={insertNewTab}
            onNewGroup={() => insertGroupSibling()}
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
  /** Set a group AND every nested descendant group to the
   *  given collapsed state. Bound to Cmd+→ / Cmd+← on a
   *  focused group. */
  onSetCollapsedDeep: (id: string, collapsed: boolean) => void
  onActivateLeaf: (leaf: LeafNode) => void
  onStartRename: (id: string) => void
  onCommitRename: () => void
  onCancelRename: () => void
  onRenameDraft: (draft: string) => void
  onDelete: (id: string) => void
  onNewTab: () => void
  onNewGroup: () => void
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
    onSetCollapsedDeep,
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
      // Cmd/Ctrl modifier → recursively expand this
      // group AND every nested descendant group. Without
      // modifier → just toggle this group open.
      if (event.metaKey || event.ctrlKey) {
        onSetCollapsedDeep(node.id, false)
      } else if (node.collapsed) {
        onToggleCollapse(node.id)
      }
    } else if (event.key === 'ArrowLeft') {
      handled()
      // Cmd/Ctrl modifier → recursively collapse this
      // group AND every nested descendant group.
      if (event.metaKey || event.ctrlKey) {
        onSetCollapsedDeep(node.id, true)
      } else if (!node.collapsed) {
        onToggleCollapse(node.id)
      }
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
      onNewGroup()
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
        /* No double-click. Rename via Enter on the
           focused row. Double-click was creating
           accidental rename mode when users were just
           rapidly clicking around the sidebar. */
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
        {/* Aggregate status dot — reflects whatever any
            descendant leaf is doing. Empty groups show ᛫
            (idle); any descendant running → ○; any
            descendant currently emitting output → ●. */}
        <GroupStatusDot group={node} />
        {/* Child count badge — always shown. CSS dims it
            when EXPANDED, brightens it when COLLAPSED. */}
        <GroupCount group={node} />
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
      onNewGroup()
    } else if (
      (event.metaKey || event.ctrlKey) &&
      (event.key.toLowerCase() === 'w' ||
        event.key === 'Backspace' ||
        event.key === 'Delete')
    ) {
      event.preventDefault()
      event.stopPropagation()
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
 * Indicator glyph for a slab.
 *
 *   ᛫  no process running in this slab (idle)
 *   ○  process running, nothing happening
 *   ●  process running, actively crunching
 *   ◐  starting up
 *   ✕  failed
 *
 * The ○ ↔ ● transition uses an ASYMMETRIC debounce so the
 * glyph doesn't jolt back and forth when output arrives
 * in periodic bursts (watchers, loggers, Claude streaming
 * its tokens, etc.):
 *
 *   ○ → ●  fires after 300ms of continuous busy. Fast
 *           because user wants quick feedback that work
 *           started.
 *   ● → ○  fires after 4300ms of continuous quiet. Slow
 *           so brief lulls don't cause the dot to flicker.
 */
function LeafStatusDot({
  status,
  slabId,
}: {
  status: string
  slabId: string | undefined
}) {
  const { busy } = useSlabActivity(slabId)
  const stableBusy = useAsymmetricStable(busy, 300, 4300)

  let char = ''
  let dataStatus = status
  if (status === 'failed') char = '✕'
  else if (status === 'starting') char = '◐'
  else if (status === 'running') {
    if (stableBusy) {
      char = '●'
      dataStatus = 'busy'
    } else {
      char = '○'
    }
  } else if (status === 'exited' || status === 'idle' || status === '') {
    // No process active (never spawned, or spawned and exited).
    // Show the small "᛫" rather than nothing so the leaf
    // always has a status glyph and the user knows the
    // slab is dormant rather than missing.
    char = '᛫'
    dataStatus = 'idle'
  }

  if (!char) return null
  return (
    <span
      data-rock-leaf-dot=""
      data-status={dataStatus}
      aria-label={dataStatus}
    >
      {char}
    </span>
  )
}

/**
 * Returns `value`, but only after it's held steady for
 * `upDelay` (when transitioning to true) or `downDelay`
 * (when transitioning to false) milliseconds. Used by
 * LeafStatusDot so the busy glyph reacts fast to work
 * starting but slowly to work pausing.
 */
function useAsymmetricStable(
  value: boolean,
  upDelay: number,
  downDelay: number,
): boolean {
  const [stable, setStable] = useState(value)
  useEffect(() => {
    if (stable === value) return
    const t = setTimeout(
      () => setStable(value),
      value ? upDelay : downDelay,
    )
    return () => clearTimeout(t)
  }, [value, upDelay, downDelay, stable])
  return stable
}

/**
 * Tiny child-count tag shown on the right of every group
 * header. Counts every leaf reachable from this group
 * (including those nested inside subgroups). CSS dims the
 * count when the group is expanded (count = redundant
 * signal) and brightens it when collapsed (count = only
 * signal that there's stuff hidden).
 */
/**
 * Group-level status dot. Walks every descendant leaf
 * and aggregates:
 *
 *   any descendant busy   → ● (with asymmetric debounce)
 *   else any running      → ○
 *   else (empty / exited) → ᛫
 *
 * Lets the user see at-a-glance whether anything inside
 * a collapsed group is currently doing work, without
 * expanding the group to check.
 */
function GroupStatusDot({ group }: { group: GroupNode }) {
  const slabIdByName = useTerminalStore(s => s.slabIdByName)
  const slabs = useTerminalStore(s => s.slabs)

  // Collect every descendant slabId once per render.
  const descendantSlabIds = useMemo(() => {
    const ids: string[] = []
    function walk(nodes: TreeNode[]) {
      for (const n of nodes) {
        if (n.kind === 'group') walk(n.children)
        else {
          const id = slabIdByName[n.slabName]
          if (id) ids.push(id)
        }
      }
    }
    walk(group.children)
    return ids
  }, [group, slabIdByName])

  // Subscribe to slab:data for ANY descendant slab. Any
  // arriving byte flips `anyBusy` true; goes false after
  // 250ms of quiet across all descendants.
  const api = useTerminalApi()
  const [anyBusyRaw, setAnyBusyRaw] = useState(false)
  useEffect(() => {
    if (descendantSlabIds.length === 0) {
      setAnyBusyRaw(false)
      return
    }
    const set = new Set(descendantSlabIds)
    let timer: ReturnType<typeof setTimeout> | null = null
    const off = api.onEvent(event => {
      if (event.type !== 'slab:data') return
      if (!set.has(event.payload.slabId)) return
      setAnyBusyRaw(true)
      if (timer) clearTimeout(timer)
      timer = setTimeout(() => setAnyBusyRaw(false), 250)
    })
    return () => {
      off()
      if (timer) clearTimeout(timer)
    }
  }, [api, descendantSlabIds])

  const stableBusy = useAsymmetricStable(anyBusyRaw, 300, 4300)
  const anyRunning = descendantSlabIds.some(
    id => slabs[id]?.status === 'running' || slabs[id]?.status === 'starting',
  )

  let char: string
  let dataStatus: string
  if (stableBusy && anyRunning) {
    char = '●'
    dataStatus = 'busy'
  } else if (anyRunning) {
    char = '○'
    dataStatus = 'running'
  } else {
    char = '᛫'
    dataStatus = 'idle'
  }

  return (
    <span
      data-rock-leaf-dot=""
      data-status={dataStatus}
      aria-label={dataStatus}
      style={{ marginLeft: 'auto', marginRight: 6 }}
    >
      {char}
    </span>
  )
}

function GroupCount({ group }: { group: GroupNode }) {
  const total = useMemo(() => {
    let t = 0
    function walk(nodes: TreeNode[]) {
      for (const n of nodes) {
        if (n.kind === 'group') walk(n.children)
        else t += 1
      }
    }
    walk(group.children)
    return t
  }, [group])
  // Always render — even 0 reads as "this is a group,
  // it's just empty right now". Without it, an empty
  // group is visually indistinguishable from a leaf.
  return (
    <span
      data-rock-branch-count=""
      aria-label={`${total} item${total === 1 ? '' : 's'}`}
    >
      {total}
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

/**
 * Sidebar tree data model + immutable mutation helpers.
 *
 * The tree is a `TreeNode[]` of groups (which contain
 * more nodes) and leaves (which point to a slab by name).
 *
 * All mutation helpers return a NEW tree; they never
 * mutate input. The renderer can directly check
 * referential equality in `useMemo` deps.
 *
 * Persisted in `<projectRoot>/.rock/base.json`. See
 * `cluesurf/note/library/rock/sidebar-tree-design.md`
 * for the full design.
 */

export type TreeNode = GroupNode | LeafNode

export type GroupNode = {
  kind: 'group'
  /** Stable id across renames. Used as the dnd-kit + React key. */
  id: string
  /** User-editable display label. */
  label: string
  /** UI state — true means children are hidden. */
  collapsed: boolean
  children: TreeNode[]
}

export type LeafNode = {
  kind: 'leaf'
  id: string
  /** The slab name this leaf points to. Stable. */
  slabName: string
  /** Optional display label. If absent, render slabName. */
  label?: string
}

// ────────────────────────────────────────────────────────
// Lookup helpers
// ────────────────────────────────────────────────────────

export function findNode(
  tree: TreeNode[],
  id: string,
): TreeNode | null {
  for (const node of tree) {
    if (node.id === id) return node
    if (node.kind === 'group') {
      const found = findNode(node.children, id)
      if (found) return found
    }
  }
  return null
}

/** Locate the parent group of `id`, or null if it's at root. */
export function findParent(
  tree: TreeNode[],
  id: string,
): GroupNode | null {
  for (const node of tree) {
    if (node.kind === 'group') {
      if (node.children.some(c => c.id === id)) return node
      const deeper = findParent(node.children, id)
      if (deeper) return deeper
    }
  }
  return null
}

/** Return every leaf node in the tree, in pre-order. */
export function flattenLeaves(tree: TreeNode[]): LeafNode[] {
  const out: LeafNode[] = []
  for (const node of tree) {
    if (node.kind === 'leaf') out.push(node)
    else out.push(...flattenLeaves(node.children))
  }
  return out
}

/** Flatten the tree to only the VISIBLE nodes (skipping
 *  children of collapsed groups). Used for keyboard nav. */
export function visibleOrder(tree: TreeNode[]): TreeNode[] {
  const out: TreeNode[] = []
  for (const node of tree) {
    out.push(node)
    if (node.kind === 'group' && !node.collapsed) {
      out.push(...visibleOrder(node.children))
    }
  }
  return out
}

/** True if `descendant` lives anywhere inside `ancestor`. */
export function isDescendant(
  ancestor: GroupNode,
  descendantId: string,
): boolean {
  for (const child of ancestor.children) {
    if (child.id === descendantId) return true
    if (child.kind === 'group' && isDescendant(child, descendantId)) {
      return true
    }
  }
  return false
}

// ────────────────────────────────────────────────────────
// Mutation helpers (all return a new tree)
// ────────────────────────────────────────────────────────

/** Add a node as the last child of `parentId`, or at root
 *  if parentId is null. */
export function appendNode(
  tree: TreeNode[],
  node: TreeNode,
  parentId: string | null,
): TreeNode[] {
  if (parentId === null) return [...tree, node]
  return tree.map(n => {
    if (n.kind !== 'group') return n
    if (n.id === parentId) {
      return { ...n, children: [...n.children, node] }
    }
    return { ...n, children: appendNode(n.children, node, parentId) }
  })
}

/** Add a node as the FIRST child of `groupId`. No-op if
 *  the group doesn't exist or the target isn't a group. */
export function prependChild(
  tree: TreeNode[],
  node: TreeNode,
  groupId: string,
): TreeNode[] {
  return tree.map(n => {
    if (n.kind !== 'group') return n
    if (n.id === groupId) {
      return { ...n, children: [node, ...n.children], collapsed: false }
    }
    return { ...n, children: prependChild(n.children, node, groupId) }
  })
}

/** Insert `node` as the sibling immediately AFTER `targetId`,
 *  walking into nested groups to find it. No-op if not found. */
export function insertNodeAfter(
  tree: TreeNode[],
  node: TreeNode,
  targetId: string,
): TreeNode[] {
  const i = tree.findIndex(n => n.id === targetId)
  if (i >= 0) {
    const next = [...tree]
    next.splice(i + 1, 0, node)
    return next
  }
  return tree.map(n => {
    if (n.kind !== 'group') return n
    return { ...n, children: insertNodeAfter(n.children, node, targetId) }
  })
}

/** Remove a node by id. Returns the new tree + the removed
 *  node (so callers can re-insert it elsewhere). */
export function removeNode(
  tree: TreeNode[],
  id: string,
): { tree: TreeNode[]; removed: TreeNode | null } {
  let removed: TreeNode | null = null
  function recurse(nodes: TreeNode[]): TreeNode[] {
    const result: TreeNode[] = []
    for (const node of nodes) {
      if (node.id === id) {
        removed = node
        continue
      }
      if (node.kind === 'group') {
        result.push({ ...node, children: recurse(node.children) })
      } else {
        result.push(node)
      }
    }
    return result
  }
  const next = recurse(tree)
  return { tree: next, removed }
}

/** Replace one node with another by id. */
export function replaceNode(
  tree: TreeNode[],
  id: string,
  replacement: TreeNode,
): TreeNode[] {
  return tree.map(node => {
    if (node.id === id) return replacement
    if (node.kind === 'group') {
      return { ...node, children: replaceNode(node.children, id, replacement) }
    }
    return node
  })
}

/** Rename a node (group or leaf) by id. */
export function renameNode(
  tree: TreeNode[],
  id: string,
  newLabel: string,
): TreeNode[] {
  const trimmed = newLabel.trim()
  return tree.map(node => {
    if (node.id === id) {
      if (node.kind === 'group') return { ...node, label: trimmed }
      // Leaf: empty label means "use slabName"
      return { ...node, label: trimmed.length > 0 ? trimmed : undefined }
    }
    if (node.kind === 'group') {
      return { ...node, children: renameNode(node.children, id, newLabel) }
    }
    return node
  })
}

/** Toggle a group's collapsed state. */
export function toggleCollapsed(
  tree: TreeNode[],
  groupId: string,
): TreeNode[] {
  return tree.map(node => {
    if (node.id === groupId && node.kind === 'group') {
      return { ...node, collapsed: !node.collapsed }
    }
    if (node.kind === 'group') {
      return { ...node, children: toggleCollapsed(node.children, groupId) }
    }
    return node
  })
}

/** Set every group in `tree` to the same collapsed state.
 *  Used by the global Cmd+→ / Cmd+← bindings to fold
 *  or unfold the whole tree in one action. */
export function setAllCollapsed(
  tree: TreeNode[],
  collapsed: boolean,
): TreeNode[] {
  return tree.map(node => {
    if (node.kind !== 'group') return node
    return {
      ...node,
      collapsed,
      children: setAllCollapsed(node.children, collapsed),
    }
  })
}

/** Set the targeted group AND every descendant group to
 *  the same collapsed state. Per-row Cmd+→ / Cmd+← acts
 *  on a focused group; this lets the user fold/unfold a
 *  whole subtree at once instead of clicking each branch. */
export function setCollapsedDeep(
  tree: TreeNode[],
  groupId: string,
  collapsed: boolean,
): TreeNode[] {
  return tree.map(node => {
    if (node.kind !== 'group') return node
    if (node.id === groupId) {
      return {
        ...node,
        collapsed,
        children: setAllCollapsed(node.children, collapsed),
      }
    }
    return {
      ...node,
      children: setCollapsedDeep(node.children, groupId, collapsed),
    }
  })
}

export type DropPosition = 'before' | 'after' | 'inside'

/**
 * Move `dragId` relative to `targetId`. Respects:
 *   - 'before'/'after' → sibling of target
 *   - 'inside' → child of target (target must be a group)
 *   - prevents moving a group into its own descendant
 *   - moving onto self is a no-op
 */
export function moveNode(
  tree: TreeNode[],
  dragId: string,
  targetId: string,
  position: DropPosition,
): TreeNode[] {
  if (dragId === targetId) return tree

  const dragNode = findNode(tree, dragId)
  if (!dragNode) return tree

  // Prevent moving a group into itself or a descendant.
  if (
    dragNode.kind === 'group' &&
    (targetId === dragId || isDescendant(dragNode, targetId))
  ) {
    return tree
  }

  const target = findNode(tree, targetId)
  if (!target) return tree
  if (position === 'inside' && target.kind !== 'group') {
    return tree
  }

  const { tree: removed } = removeNode(tree, dragId)

  if (position === 'inside') {
    return appendNode(removed, dragNode, targetId)
  }

  // before/after: insert as sibling of target
  return insertSibling(removed, dragNode, targetId, position)
}

function insertSibling(
  tree: TreeNode[],
  node: TreeNode,
  targetId: string,
  position: 'before' | 'after',
): TreeNode[] {
  const i = tree.findIndex(n => n.id === targetId)
  if (i >= 0) {
    const next = [...tree]
    next.splice(position === 'before' ? i : i + 1, 0, node)
    return next
  }
  return tree.map(n => {
    if (n.kind === 'group') {
      return {
        ...n,
        children: insertSibling(n.children, node, targetId, position),
      }
    }
    return n
  })
}

// ────────────────────────────────────────────────────────
// Constructors
// ────────────────────────────────────────────────────────

let counter = 0
function makeNodeId(prefix: string): string {
  counter += 1
  return `${prefix}_${Date.now().toString(36)}${counter.toString(36)}`
}

export function makeGroup(label: string, children: TreeNode[] = []): GroupNode {
  return {
    kind: 'group',
    id: makeNodeId('g'),
    label,
    collapsed: false,
    children,
  }
}

export function makeLeaf(slabName: string, label?: string): LeafNode {
  return {
    kind: 'leaf',
    id: makeNodeId('l'),
    slabName,
    label,
  }
}

/** Build a flat tree from a list of slab names. Used to
 *  migrate from the pre-tree sidebar. */
export function flatTree(slabNames: string[]): TreeNode[] {
  return slabNames.map(name => makeLeaf(name))
}

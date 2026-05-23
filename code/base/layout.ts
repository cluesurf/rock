import type { ID, LayoutNode } from './types'

export function makeEvenSplit(slabIds: ID[]): LayoutNode {
  if (slabIds.length === 0) {
    throw new Error('Cannot create layout with no slabs')
  }
  if (slabIds.length === 1) {
    return {
      type: 'slab',
      slabId: slabIds[0]!,
    }
  }
  const middleIndex = Math.ceil(slabIds.length / 2)
  return {
    type: 'split',
    direction: 'horizontal',
    ratio: 0.5,
    children: [
      makeEvenSplit(slabIds.slice(0, middleIndex)),
      makeEvenSplit(slabIds.slice(middleIndex)),
    ],
  }
}

export function findSlabIds(node: LayoutNode): ID[] {
  if (node.type === 'slab') {
    return [node.slabId]
  }
  return [...findSlabIds(node.children[0]), ...findSlabIds(node.children[1])]
}

export function replaceSlab(
  node: LayoutNode,
  slabId: ID,
  next: LayoutNode,
): LayoutNode {
  if (node.type === 'slab') {
    return node.slabId === slabId ? next : node
  }
  return {
    ...node,
    children: [
      replaceSlab(node.children[0], slabId, next),
      replaceSlab(node.children[1], slabId, next),
    ],
  }
}

export function removeSlab(node: LayoutNode, slabId: ID): LayoutNode | null {
  if (node.type === 'slab') {
    return node.slabId === slabId ? null : node
  }
  const left = removeSlab(node.children[0], slabId)
  const right = removeSlab(node.children[1], slabId)
  if (left && right) {
    return { ...node, children: [left, right] }
  }
  return left ?? right
}

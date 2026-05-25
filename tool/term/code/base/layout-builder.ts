import type { ID, LayoutNode } from './types'

/**
 * Fluent layout AST builder. Use in `.tool/term/layout.ts`
 * for declarative layouts.
 *
 *     import { split, slab } from '@cluesurf/term/base/layout-builder'
 *     export default split.horizontal(
 *       slab('web'),
 *       split.vertical(slab('api'), slab('db')),
 *     )
 *
 * Slab names are symbolic. They get resolved to slab
 * IDs at workspace compile time.
 */

export function slab(slabId: ID): LayoutNode {
  return { type: 'slab', slabId }
}

export const split = {
  horizontal(
    left: LayoutNode,
    right: LayoutNode,
    ratio: number = 0.5,
  ): LayoutNode {
    return {
      type: 'split',
      direction: 'horizontal',
      ratio: clamp(ratio, 0.05, 0.95),
      children: [left, right],
    }
  },

  vertical(
    top: LayoutNode,
    bottom: LayoutNode,
    ratio: number = 0.5,
  ): LayoutNode {
    return {
      type: 'split',
      direction: 'vertical',
      ratio: clamp(ratio, 0.05, 0.95),
      children: [top, bottom],
    }
  },
}

/**
 * Resolve symbolic slab references to real slab IDs.
 * Used when the layout AST uses slab names that need
 * to be matched against compiled slab records.
 */
export function resolveLayoutSlabs(
  node: LayoutNode,
  resolver: (symbolicId: string) => ID,
): LayoutNode {
  if (node.type === 'slab') {
    return { type: 'slab', slabId: resolver(node.slabId) }
  }
  return {
    ...node,
    children: [
      resolveLayoutSlabs(node.children[0], resolver),
      resolveLayoutSlabs(node.children[1], resolver),
    ],
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

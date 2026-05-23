import type { ReactNode } from 'react'
import { TerminalSlab } from './terminal-slab'
import { useTerminalStore } from './use-terminal-store'

/**
 * JSX layout primitives for `.rock/layout.tsx`.
 *
 * The user composes layouts in React, the same way they
 * compose any UI tree. No custom DSL, no AST builders.
 *
 *     // .term/layout.tsx
 *     import { Split, Slab } from '@cluesurf/rock/face'
 *
 *     export default function Layout() {
 *       return (
 *         <Split horizontal>
 *           <Slab name="web" />
 *           <Split vertical>
 *             <Slab name="api" />
 *             <Slab name="logs" />
 *           </Split>
 *         </Split>
 *       )
 *     }
 */

export type SplitProps = {
  /** Side-by-side (horizontal axis = children laid out left-to-right). */
  horizontal?: boolean
  /** Stacked (vertical axis = children laid out top-to-bottom). */
  vertical?: boolean
  /**
   * First child's size ratio. 0.5 = even split. Defaults
   * to even distribution across all children.
   */
  ratio?: number
  children: ReactNode
}

export function Split({
  horizontal,
  vertical,
  ratio,
  children,
}: SplitProps) {
  const direction: 'row' | 'column' = horizontal
    ? 'row'
    : vertical
      ? 'column'
      : 'row'
  const isHorizontal = direction === 'row'

  const items = Array.isArray(children) ? children : [children]
  const validItems = items.filter(Boolean)

  if (validItems.length === 0) return null
  if (validItems.length === 1) return <>{validItems[0]}</>

  const ratios = computeRatios(validItems.length, ratio)

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: direction,
        width: '100%',
        height: '100%',
        overflow: 'hidden',
      }}
    >
      {validItems.map((child, index) => (
        <div
          key={index}
          style={{
            ...(isHorizontal
              ? { width: `${ratios[index]! * 100}%`, height: '100%', minWidth: 0 }
              : { height: `${ratios[index]! * 100}%`, width: '100%', minHeight: 0 }),
          }}
        >
          {child}
        </div>
      ))}
    </div>
  )
}

export type SlabProps = {
  /** Symbolic slab name from `.rock/workspace.ts`. */
  name: string
}

export function Slab({ name }: SlabProps) {
  const slabId = useTerminalStore(state => state.slabIdByName[name])

  if (!slabId) {
    return (
      <div
        style={{
          padding: 12,
          color: '#9ca3af',
          fontFamily: 'monospace',
          fontSize: 12,
        }}
      >
        Slab &quot;{name}&quot; not found.
      </div>
    )
  }

  return <TerminalSlab slabId={slabId} />
}

function computeRatios(count: number, firstRatio?: number): number[] {
  if (count === 2 && typeof firstRatio === 'number') {
    const clamped = Math.max(0.05, Math.min(0.95, firstRatio))
    return [clamped, 1 - clamped]
  }
  const even = 1 / count
  return Array.from({ length: count }, () => even)
}

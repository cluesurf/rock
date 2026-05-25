import type { ReactNode } from 'react'

/**
 * Chromeless layout organizer. Splits its children
 * horizontally or vertically. No visual styling by default;
 * style with the optional `@cluesurf/term/tailwind/preset.css`
 * or your own CSS via `className`.
 *
 *     <Nest direction="horizontal">
 *       <Slab name="web" />
 *       <Nest direction="vertical">
 *         <Slab name="api" />
 *         <Slab name="logs" />
 *       </Nest>
 *     </Nest>
 *
 * Single-child Nest renders the child directly (no wrapper).
 */

export type NestProps = {
  /** 'horizontal' = side-by-side (default). 'vertical' = stacked. */
  direction?: 'horizontal' | 'vertical'
  /**
   * First child's portion when there are exactly 2 children.
   * Default 0.5. With 3+ children, distributes evenly.
   */
  ratio?: number
  /** Gap in pixels between children (default 0). */
  gap?: number
  children: ReactNode
  className?: string
}

export function Nest({
  direction = 'horizontal',
  ratio,
  gap = 0,
  children,
  className,
}: NestProps) {
  const items = Array.isArray(children) ? children : [children]
  const valid = items.filter(Boolean)

  if (valid.length === 0) return null
  if (valid.length === 1) return <>{valid[0]}</>

  const isHorizontal = direction === 'horizontal'
  const ratios = computeRatios(valid.length, ratio)

  return (
    <div
      data-term-nest=""
      data-direction={direction}
      className={className}
      style={{
        display: 'flex',
        flexDirection: isHorizontal ? 'row' : 'column',
        width: '100%',
        height: '100%',
        overflow: 'hidden',
        gap: gap ? `${gap}px` : undefined,
      }}
    >
      {valid.map((child, index) => (
        <div
          key={index}
          data-term-nest-cell=""
          style={
            isHorizontal
              ? { width: `${ratios[index]! * 100}%`, height: '100%', minWidth: 0 }
              : { height: `${ratios[index]! * 100}%`, width: '100%', minHeight: 0 }
          }
        >
          {child}
        </div>
      ))}
    </div>
  )
}

function computeRatios(count: number, firstRatio?: number): number[] {
  if (count === 2 && typeof firstRatio === 'number') {
    const clamped = Math.max(0.05, Math.min(0.95, firstRatio))
    return [clamped, 1 - clamped]
  }
  const even = 1 / count
  return Array.from({ length: count }, () => even)
}

import type { ReactNode } from 'react'

/**
 * Horizontal status / toolbar strip.
 *
 *     <Bar position="bottom">
 *       <Cell>{focused}</Cell>
 *       <Cell align="right">{time}</Cell>
 *     </Bar>
 */

export type BarProps = {
  position?: 'top' | 'bottom'
  className?: string
  children: ReactNode
}

export function Bar({ position = 'bottom', className, children }: BarProps) {
  return (
    <div
      data-term-bar=""
      data-position={position}
      className={className}
      role="toolbar"
    >
      {children}
    </div>
  )
}

export type CellProps = {
  align?: 'left' | 'center' | 'right'
  onClick?: () => void
  className?: string
  children: ReactNode
}

export function Cell({ align = 'left', onClick, className, children }: CellProps) {
  return (
    <div
      data-term-cell=""
      data-align={align}
      className={className}
      onClick={onClick}
      style={{ cursor: onClick ? 'pointer' : undefined }}
    >
      {children}
    </div>
  )
}

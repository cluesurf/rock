import { createRoot } from 'react-dom/client'
import type { ReactNode } from 'react'

/**
 * Mount a React tree. Pure thin wrapper around
 * `createRoot`. The element should contain a `<Slab>` at
 * the top — Slab provides the rock context.
 *
 *     mount(
 *       <Slab>
 *         <YourLayout />
 *       </Slab>
 *     )
 */
export function mount(element: ReactNode, selector = '#root'): void {
  const container = document.querySelector(selector)
  if (!container) {
    throw new Error(`mount: no element matches selector '${selector}'`)
  }
  createRoot(container).render(element)
}

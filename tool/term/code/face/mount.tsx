import { createRoot } from 'react-dom/client'
import type { ReactNode } from 'react'
import { installExternalBridge } from './external-bridge'

/**
 * Mount a React tree. Thin wrapper around `createRoot`
 * that also installs the external bridge (React + face
 * exposed on `globalThis.__term__`) so JIT-compiled user
 * code can resolve shared modules.
 *
 *     mount(
 *       <Slab>
 *         <YourLayout />
 *       </Slab>
 *     )
 */
export function mount(element: ReactNode, selector = '#root'): void {
  installExternalBridge()
  const container = document.querySelector(selector)
  if (!container) {
    throw new Error(`mount: no element matches selector '${selector}'`)
  }
  createRoot(container).render(element)
}

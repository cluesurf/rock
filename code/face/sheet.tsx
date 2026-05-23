import { useEffect, type ReactNode } from 'react'

/**
 * Generic modal overlay. Backdrop click + ESC close.
 * Used by `<Palette>` and available for app-specific
 * modals.
 *
 *     <Sheet open={open} onClose={() => setOpen(false)}>
 *       <h2>Settings</h2>
 *     </Sheet>
 */

export type SheetProps = {
  open: boolean
  onClose: () => void
  className?: string
  children: ReactNode
}

export function Sheet({ open, onClose, className, children }: SheetProps) {
  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  return (
    <div
      data-rock-sheet=""
      onClick={e => e.target === e.currentTarget && onClose()}
      role="dialog"
      aria-modal="true"
    >
      <div data-rock-sheet-modal="" className={className}>
        {children}
      </div>
    </div>
  )
}

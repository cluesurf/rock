import { useEffect, useState, type ReactNode } from 'react'

/**
 * Transient notifications.
 *
 *     <Toast />  // mount once near the root
 *
 *     toast.success('Deployed!')
 *     toast.error('Build failed', { duration: 5000 })
 *     toast.info('Restarting…', { id: 'restart-api' })
 */

export type ToastKind = 'info' | 'success' | 'warn' | 'error' | 'custom'

export type ToastOptions = {
  id?: string
  duration?: number
  action?: { label: string; onClick: () => void }
  dismissible?: boolean
}

export type ToastEntry = {
  id: string
  kind: ToastKind
  content: ReactNode
  duration: number
  action?: { label: string; onClick: () => void }
  dismissible: boolean
}

type Subscriber = (entries: ToastEntry[]) => void

const subscribers = new Set<Subscriber>()
let entries: ToastEntry[] = []

function emit() {
  for (const sub of subscribers) sub(entries)
}

function add(
  kind: ToastKind,
  content: ReactNode,
  options: ToastOptions = {},
): string {
  const id = options.id ?? Math.random().toString(36).slice(2)
  const entry: ToastEntry = {
    id,
    kind,
    content,
    duration: options.duration ?? 3000,
    action: options.action,
    dismissible: options.dismissible ?? true,
  }
  // replace existing with same id
  entries = [...entries.filter(e => e.id !== id), entry]
  emit()

  if (entry.duration > 0) {
    setTimeout(() => dismiss(id), entry.duration)
  }
  return id
}

function dismiss(id: string) {
  entries = entries.filter(e => e.id !== id)
  emit()
}

export const toast = {
  info:    (content: ReactNode, opts?: ToastOptions) => add('info',    content, opts),
  success: (content: ReactNode, opts?: ToastOptions) => add('success', content, opts),
  warn:    (content: ReactNode, opts?: ToastOptions) => add('warn',    content, opts),
  error:   (content: ReactNode, opts?: ToastOptions) => add('error',   content, opts),
  custom:  (content: ReactNode, opts?: ToastOptions) => add('custom',  content, opts),
  dismiss,
}

export function Toast() {
  const [list, setList] = useState<ToastEntry[]>(entries)

  useEffect(() => {
    subscribers.add(setList)
    return () => { subscribers.delete(setList) }
  }, [])

  if (list.length === 0) return null

  return (
    <div data-rock-toast-wrap="" role="region" aria-label="Notifications">
      {list.map(entry => (
        <div
          key={entry.id}
          data-rock-toast=""
          data-kind={entry.kind}
          role="alert"
        >
          <div data-rock-toast-body="">{entry.content}</div>
          {entry.action && (
            <button
              type="button"
              data-rock-toast-action=""
              onClick={() => {
                entry.action!.onClick()
                dismiss(entry.id)
              }}
            >
              {entry.action.label}
            </button>
          )}
          {entry.dismissible && (
            <button
              type="button"
              data-rock-toast-close=""
              onClick={() => dismiss(entry.id)}
              aria-label="Dismiss"
            >
              ×
            </button>
          )}
        </div>
      ))}
    </div>
  )
}

/**
 * Auto-toast helper: subscribes to common slab events and
 * surfaces them as toasts.
 */
export function useAutoToasts(_opts: {
  slabExit?: boolean
  slabError?: boolean
  workspace?: boolean
} = {}): void {
  // Placeholder: wiring requires the store's event applier
  // to expose hooks. For v1 just no-op so the API surface
  // exists; subscribe-and-toast can be added without
  // breaking the API.
}

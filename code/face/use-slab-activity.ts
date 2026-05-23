/**
 * Per-slab activity tracking.
 *
 *   const { busy, idleFor } = useSlabActivity(slabId)
 *
 * Watches the terminal IPC stream for `slab:data` events
 * with this slabId. `busy` is true while data is flowing
 * (resets ~250ms after the last byte). `idleFor` is the
 * time since the last data byte (Infinity if never seen).
 *
 * Use to show "command running" indicators in sidebars,
 * tab dots, etc. without polling the PTY.
 */

import { useEffect, useState } from 'react'
import { useTerminalApi } from './terminal-api'

const IDLE_THRESHOLD_MS = 250

export type SlabActivity = {
  /** True while data is arriving from the PTY. Resets
   *  IDLE_THRESHOLD_MS after the last byte. */
  busy: boolean
  /** Epoch ms of the last data event. */
  lastActiveAt: number | null
}

export function useSlabActivity(slabId: string | undefined): SlabActivity {
  const api = useTerminalApi()
  const [busy, setBusy] = useState(false)
  const [lastActiveAt, setLastActiveAt] = useState<number | null>(null)

  useEffect(() => {
    if (!slabId) {
      setBusy(false)
      return
    }
    let timer: ReturnType<typeof setTimeout> | null = null
    const off = api.onEvent(event => {
      if (event.type !== 'slab:data') return
      if (event.payload.slabId !== slabId) return
      setBusy(true)
      setLastActiveAt(Date.now())
      if (timer) clearTimeout(timer)
      timer = setTimeout(() => setBusy(false), IDLE_THRESHOLD_MS)
    })
    return () => {
      off()
      if (timer) clearTimeout(timer)
    }
  }, [api, slabId])

  return { busy, lastActiveAt }
}

/**
 * Track a slab's "command" duration via the activity hook.
 * Returns the duration (ms) since the slab started its
 * current burst of activity. Null when idle.
 *
 * When a burst ends (busy → idle) AND duration > threshold,
 * the optional `onComplete` callback fires — useful for
 * desktop notifications on long-running commands.
 *
 *     useCommandDuration(slabId, {
 *       thresholdMs: 5000,
 *       onComplete(durationMs) {
 *         new Notification(`done in ${(durationMs/1000)|0}s`)
 *       },
 *     })
 */
export function useCommandDuration(
  slabId: string | undefined,
  opts: {
    thresholdMs?: number
    onComplete?: (durationMs: number) => void
  } = {},
): number | null {
  const { thresholdMs = 5000, onComplete } = opts
  const { busy } = useSlabActivity(slabId)
  const [startedAt, setStartedAt] = useState<number | null>(null)

  useEffect(() => {
    if (busy) {
      if (startedAt === null) setStartedAt(Date.now())
      return
    }
    // Burst ended — compute duration, maybe notify.
    if (startedAt !== null) {
      const duration = Date.now() - startedAt
      setStartedAt(null)
      if (duration >= thresholdMs && onComplete) {
        onComplete(duration)
      }
    }
  }, [busy, startedAt, thresholdMs, onComplete])

  return startedAt
}

/**
 * Aggregate activity across ALL slabs in the window.
 * Returns the set of slab IDs that have shown output in
 * the last `withinMs` milliseconds. Used by close-confirm
 * to detect "is anything running?".
 *
 *     const busy = useAnyBusySlabs(5000)
 *     if (busy.size > 0) showConfirm()
 */
export function useAnyBusySlabs(withinMs = 5000): Set<string> {
  const api = useTerminalApi()
  const [active, setActive] = useState<Set<string>>(new Set())

  useEffect(() => {
    const lastSeen = new Map<string, number>()
    const tick = () => {
      const now = Date.now()
      const next = new Set<string>()
      for (const [id, at] of lastSeen) {
        if (now - at <= withinMs) next.add(id)
      }
      setActive(prev => {
        if (prev.size === next.size) {
          let same = true
          for (const id of next) {
            if (!prev.has(id)) {
              same = false
              break
            }
          }
          if (same) return prev
        }
        return next
      })
    }
    const off = api.onEvent(event => {
      if (event.type !== 'slab:data') return
      lastSeen.set(event.payload.slabId, Date.now())
      tick()
    })
    const interval = setInterval(tick, 1000)
    return () => {
      off()
      clearInterval(interval)
    }
  }, [api, withinMs])

  return active
}

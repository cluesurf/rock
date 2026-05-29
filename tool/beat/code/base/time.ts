/**
 * Time formatting helpers, runtime-agnostic.
 */

/**
 * Format a millisecond duration as a clock string, e.g.
 * 83000 -> "1:23". Used for take lengths and the live
 * recording timer.
 */

export function formatClock(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}:${seconds.toString().padStart(2, '0')}`
}

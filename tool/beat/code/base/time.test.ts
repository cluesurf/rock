import { describe, expect, it } from 'vitest'
import { formatClock } from '@/base/time'

describe('formatClock', () => {
  it('formats whole minutes and seconds', () => {
    expect(formatClock(0)).toBe('0:00')
    expect(formatClock(5_000)).toBe('0:05')
    expect(formatClock(83_000)).toBe('1:23')
    expect(formatClock(600_000)).toBe('10:00')
  })

  it('floors partial seconds', () => {
    expect(formatClock(1_999)).toBe('0:01')
  })
})

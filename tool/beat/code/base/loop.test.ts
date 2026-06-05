import { describe, expect, it } from 'vitest'
import { buildLoopSegments } from '@/base/loop'
import type { Section } from '@/base/types'

const sections: Section[] = [
  { id: 'a', songId: 's', name: 'Intro', startMs: 0, endMs: 1_000 },
  { id: 'b', songId: 's', name: 'Verse', startMs: 1_000, endMs: 2_500 },
  { id: 'c', songId: 's', name: 'Chorus', startMs: 2_500, endMs: 5_000 },
]

describe('buildLoopSegments', () => {
  it('returns selected segments in time order, ignoring selection order', () => {
    expect(buildLoopSegments({ sections, selectedIds: ['c', 'a'] })).toEqual([
      { startMs: 0, endMs: 1_000 },
      { startMs: 2_500, endMs: 5_000 },
    ])
  })

  it('falls back to the next section start when endMs is missing', () => {
    const open: Section[] = [
      { id: 'x', songId: 's', name: 'A', startMs: 0 },
      { id: 'y', songId: 's', name: 'B', startMs: 3_000 },
    ]
    expect(buildLoopSegments({ sections: open, selectedIds: ['x'] })).toEqual([
      { startMs: 0, endMs: 3_000 },
    ])
  })

  it('returns nothing when nothing is selected', () => {
    expect(buildLoopSegments({ sections, selectedIds: [] })).toEqual([])
  })
})

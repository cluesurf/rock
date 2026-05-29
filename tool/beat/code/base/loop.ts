/**
 * Building loopable segments from selected sections.
 *
 * The user taps to select one or more sections (which may be
 * fine-grained and non-adjacent), and beat loops them as a
 * sequence: play each selected segment in time order, then
 * repeat from the first. Each segment is an absolute time
 * range in the song's single audio file.
 */

import type { Section } from '@/base/types'

/** An absolute time range in the song audio, in milliseconds. */

export type LoopSegment = {
  startMs: number
  endMs: number
}

/**
 * Fallback length for a section that has no end and no
 * following section. Real imported songs always carry endMs,
 * so this only guards malformed data.
 */

const FALLBACK_SEGMENT_MS = 60_000

/**
 * Turn a set of selected section ids into ordered loop
 * segments. `sections` must already be in display (time)
 * order. Each segment's end is the section's own endMs, or
 * the next section's start, or a fallback.
 */

export function buildLoopSegments({
  sections,
  selectedIds,
}: {
  sections: Section[]
  selectedIds: string[]
}): LoopSegment[] {
  return sections
    .filter(section => selectedIds.includes(section.id))
    .map(section => {
      const index = sections.findIndex(item => item.id === section.id)
      const next = sections[index + 1]
      const endMs =
        section.endMs ?? next?.startMs ?? section.startMs + FALLBACK_SEGMENT_MS
      return { startMs: section.startMs, endMs }
    })
}

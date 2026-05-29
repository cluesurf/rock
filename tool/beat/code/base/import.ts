/**
 * Turning a song definition into real Song + Section
 * records. This is the one importer shared by every source
 * of songs: the seeded samples, the in-app document-picker
 * import, and (later) cloud sync. A hand-authored song, a
 * Logic-exported sidecar, and a synced song all arrive as
 * the same SongDefinition shape and run through here.
 *
 * The Logic export sidecar (see note/tool/beat/make/
 * logic-export.md) is structurally a SongDefinition, so the
 * `parseSongDefinition` guard below is what validates the
 * untrusted JSON read off disk before it becomes app data.
 */

import { createId } from '@/base/ids'
import type { Section, Song } from '@/base/types'
import type { SectionInput, SongDefinition } from '@/base/define'

/**
 * Build a Song and its Sections from a definition, assigning
 * ids and wiring the relations. `audioUri` is the on-device
 * path to the base track, when one was imported.
 */

export function buildSong({
  definition,
  audioUri,
}: {
  definition: SongDefinition
  audioUri?: string
}): { song: Song; sections: Section[] } {
  const songId = createId('song')

  const sections: Section[] = definition.sections.map(input => ({
    id: createId('section'),
    songId,
    name: input.name,
    startMs: input.startMs,
    endMs: input.endMs,
  }))

  const song: Song = {
    id: songId,
    name: definition.name,
    audioUri: audioUri ?? definition.audio,
    sectionIds: sections.map(section => section.id),
    createdAt: 0,
    updatedAt: 0,
  }

  return { song, sections }
}

/**
 * Validate an untrusted parsed-JSON value as a
 * SongDefinition. Returns null if the top-level shape is
 * wrong, and skips any malformed section rather than
 * failing the whole import. Keeps bad files from crashing
 * the app.
 */

export function parseSongDefinition(value: unknown): SongDefinition | null {
  if (typeof value !== 'object' || value === null) {
    return null
  }
  const record = value as Record<string, unknown>
  if (typeof record.name !== 'string' || !Array.isArray(record.sections)) {
    return null
  }

  const sections: SectionInput[] = []
  for (const raw of record.sections) {
    if (typeof raw !== 'object' || raw === null) {
      continue
    }
    const section = raw as Record<string, unknown>
    if (typeof section.name !== 'string' || typeof section.startMs !== 'number') {
      continue
    }
    sections.push({
      name: section.name,
      startMs: section.startMs,
      endMs: typeof section.endMs === 'number' ? section.endMs : undefined,
    })
  }

  return {
    name: record.name,
    audio: typeof record.audio === 'string' ? record.audio : undefined,
    sections,
  }
}

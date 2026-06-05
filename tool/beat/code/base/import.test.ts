import { describe, expect, it } from 'vitest'
import { buildSong, parseSongDefinition } from '@/base/import'

describe('parseSongDefinition', () => {
  it('accepts a valid definition and drops malformed sections', () => {
    const result = parseSongDefinition({
      name: 'Code Link',
      audio: 'code-link.mp3',
      sections: [
        { name: 'intro', startMs: 0, endMs: 48_000 },
        { name: 'verse', startMs: 48_000 },
        { bad: true },
        { name: 'no-start' },
      ],
    })
    expect(result).toEqual({
      name: 'Code Link',
      audio: 'code-link.mp3',
      sections: [
        { name: 'intro', startMs: 0, endMs: 48_000 },
        { name: 'verse', startMs: 48_000, endMs: undefined },
      ],
    })
  })

  it('rejects non-objects and missing fields', () => {
    expect(parseSongDefinition(42)).toBeNull()
    expect(parseSongDefinition(null)).toBeNull()
    expect(parseSongDefinition({ name: 'x' })).toBeNull()
    expect(parseSongDefinition({ sections: [] })).toBeNull()
  })
})

describe('buildSong', () => {
  it('assigns ids, wires sections, and carries the audio uri', () => {
    const { song, sections } = buildSong({
      definition: {
        name: 'Code Link',
        sections: [
          { name: 'intro', startMs: 0 },
          { name: 'verse', startMs: 48_000 },
        ],
      },
      audioUri: 'file:///code-link.mp3',
    })

    expect(song.name).toBe('Code Link')
    expect(song.audioUri).toBe('file:///code-link.mp3')
    expect(sections).toHaveLength(2)
    expect(song.sectionIds).toEqual(sections.map(section => section.id))
    expect(sections.every(section => section.songId === song.id)).toBe(true)
  })

  it('uses the definition audio path when no uri is given', () => {
    const { song } = buildSong({
      definition: { name: 'X', audio: 'x.mp3', sections: [] },
    })
    expect(song.audioUri).toBe('x.mp3')
  })
})

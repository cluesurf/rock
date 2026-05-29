/**
 * sections-from-logic
 *
 * Turn a song bounced from Logic Pro (with markers embedded as
 * chapter markers, see note/tool/beat/make/logic-export.md)
 * into beat's sections sidecar JSON.
 *
 * Reads the embedded chapters with ffprobe and writes a
 * `<audio>.sections.json` next to the audio. That sidecar has
 * the same shape as the app's SongDefinition, so the in-app
 * importer reads it directly.
 *
 * Usage (Node 24 runs TypeScript directly via type stripping):
 *
 *     node task/sections-from-logic.ts meet-home.m4a "Meet Home"
 *
 * Requires ffprobe (part of ffmpeg) on PATH.
 */

import { execFileSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import { basename } from 'node:path'
import { fileURLToPath } from 'node:url'

/** A chapter as ffprobe reports it (times are seconds-as-strings). */

type FfprobeChapter = {
  start_time: string
  end_time: string
  tags?: { title?: string }
}

type FfprobeOutput = {
  chapters: FfprobeChapter[]
}

/** A section in the sidecar (mirrors the app's SectionInput). */

type SectionInput = {
  name: string
  startMs: number
  endMs?: number
}

/** The sidecar document (mirrors the app's SongDefinition). */

type SongSidecar = {
  name: string
  audio: string
  sections: SectionInput[]
}

const FALLBACK_SECTION_NAME = 'Section'

/**
 * Convert ffprobe chapters to sections. ffprobe gives seconds
 * as strings, so multiply by 1000 and round to whole ms.
 */

export function chaptersToSections(output: FfprobeOutput): SectionInput[] {
  return output.chapters.map((chapter, index) => ({
    name: chapter.tags?.title ?? `${FALLBACK_SECTION_NAME} ${index + 1}`,
    startMs: Math.round(Number(chapter.start_time) * 1000),
    endMs: Math.round(Number(chapter.end_time) * 1000),
  }))
}

/** Run ffprobe and return its parsed chapter listing. */

export function readChapters(audioPath: string): FfprobeOutput {
  const stdout = execFileSync('ffprobe', [
    '-v',
    'quiet',
    '-print_format',
    'json',
    '-show_chapters',
    audioPath,
  ])
  return JSON.parse(stdout.toString()) as FfprobeOutput
}

function main(): void {
  const audioPath = process.argv[2]
  const songName = process.argv[3]
  if (!audioPath) {
    console.error('usage: node sections-from-logic.ts <audio> [song name]')
    process.exit(1)
  }

  const sections = chaptersToSections(readChapters(audioPath))
  const sidecar: SongSidecar = {
    name: songName ?? basename(audioPath).replace(/\.[^.]+$/, ''),
    audio: basename(audioPath),
    sections,
  }

  const outputPath = audioPath.replace(/\.[^.]+$/, '.sections.json')
  writeFileSync(outputPath, JSON.stringify(sidecar, null, 2))
  console.log(`wrote ${outputPath} with ${sections.length} sections`)
  if (sections.length === 0) {
    console.warn(
      'no chapters found. bounce to M4A with markers, or set sections by hand.',
    )
  }
}

// Run only when invoked directly, so the transform functions
// can be imported and tested without executing ffprobe.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main()
}

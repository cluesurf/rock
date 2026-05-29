/**
 * Identity helpers for authoring song data by hand. These
 * mirror term's `workspace()` helper: they do nothing at
 * runtime except give TypeScript inference and editor
 * autocomplete over the shape.
 *
 * Later, the laptop side and the marker importer produce
 * the same `SongDefinition` shape, so a hand-written song
 * and an auto-imported one are interchangeable.
 *
 *     export default song({
 *       name: 'Meet Home',
 *       sections: [
 *         { name: 'Intro', startMs: 0 },
 *         { name: 'Verse 1', startMs: 32_000 },
 *       ],
 *     })
 */

/** A section as written by hand, before ids are assigned. */

export type SectionInput = {
  name: string
  startMs: number
  endMs?: number
}

/** A song as written by hand, before ids are assigned. */

export type SongDefinition = {
  name: string
  /** Optional path to the base audio file to import. */
  audio?: string
  sections: SectionInput[]
}

/**
 * Identity helper. Pass-through with type inference.
 */

export function song<T extends SongDefinition>(input: T): T {
  return input
}

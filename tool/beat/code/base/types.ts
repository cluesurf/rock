/**
 * Core domain types for the beat music sketchbook.
 *
 * The whole app is a generic "song + sections + takes"
 * system. There are no DAW objects here on purpose: no
 * tracks, clips, lanes, busses, or mixers. A song has an
 * audio file and a list of named sections. A take is a
 * short recorded idea attached to one section.
 *
 * Sections are authored on the laptop (from Logic markers
 * or a sidecar file) and only navigated on the phone.
 */

/**
 * How the user rated a take. Stored as a small integer so
 * it sorts cleanly and round-trips through JSON and sqlite.
 */

export enum Rating {
  /** Thumbs down. Not worth revisiting. */
  Down = -1,
  /** Unrated. The default for a fresh take. */
  None = 0,
  /** Thumbs up. Worth keeping. */
  Up = 1,
  /** Starred. The best idea for this section. */
  Star = 2,
}

/**
 * A song the user is sketching ideas against. The base
 * audio is a rough export from Logic.
 */

export type Song = {
  id: string
  /** Display name, e.g. "Meet Home". */
  name: string
  /**
   * On-device file uri of the base track (the rough export
   * from Logic), once imported. Undefined for the seeded
   * sample songs, which have no audio.
   */
  audioUri?: string
  /** Section ids in display order. */
  sectionIds: string[]
  createdAt: number
  updatedAt: number
}

/**
 * A named region of a song, e.g. "Verse 1". The phone
 * shows these as tap targets and jumps playback to
 * `startMs` when tapped.
 */

export type Section = {
  id: string
  songId: string
  /** Display name shown on the tap button. */
  name: string
  /** Start position in the song, in milliseconds. */
  startMs: number
  /** End position in milliseconds, when known. */
  endMs?: number
}

/**
 * A single recorded idea. Every take belongs to a section,
 * so its musical context is never lost.
 */

export type Take = {
  id: string
  songId: string
  /** The section this idea was recorded against. */
  sectionId: string
  /**
   * On-device file uri of the recording. expo-audio writes
   * the take here. In a later phase this moves into a
   * persisted AudioFile record. Undefined until a take is
   * actually recorded.
   */
  recordingUri?: string
  /** Length of the recording in milliseconds. */
  durationMs?: number
  /** Where in the song the user was when they recorded. */
  recordedAtSongPositionMs: number
  rating: Rating
  createdAt: number
}

/**
 * Metadata pointer to an audio file on disk. The audio
 * bytes never live in sqlite, only this record does.
 */

export type AudioFile = {
  id: string
  /** Absolute or app-relative path to the file. */
  path: string
  /** Duration in milliseconds, when known. */
  durationMs?: number
  createdAt: number
}

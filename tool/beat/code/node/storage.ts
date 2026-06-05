/**
 * On-device persistence and audio file storage.
 *
 * This is beat's device-services layer. The UI never touches
 * expo-file-system directly. Song and take metadata is saved
 * as one JSON document so it survives app reloads, and
 * imported audio is copied into the durable document
 * directory (the cache directory the picker writes to can be
 * cleared by the OS).
 *
 * Durable JSON (rather than sqlite) is deliberate for this
 * phase: it is simple, has no native build, and is plenty for
 * the metadata volume. sqlite arrives if the data outgrows it.
 */

import { Directory, File, Paths } from 'expo-file-system'
import { createId } from '@/base/ids'
import type { Section, Song, Take } from '@/base/types'

/** Filename of the persisted state document. */

const STATE_FILE = 'beat-state.json'

/** Subdirectory under the document dir holding imported audio. */

const AUDIO_DIR = 'audio'

/**
 * Bump this whenever the persisted shape changes (or to
 * invalidate old data). A document with a different version is
 * ignored on load, so stale state, including any old sample
 * songs written by a previous build, never resurfaces.
 */

const STATE_VERSION = 1

/** The serializable slice of the store that is persisted. */

export type PersistedState = {
  songs: Record<string, Song>
  sections: Record<string, Section>
  takes: Record<string, Take>
  /** Last laptop import-server URL, remembered between launches. */
  serverUrl?: string
}

/** The on-disk document: the state slice plus a version tag. */

type PersistedDocument = PersistedState & { version: number }

function stateFile(): File {
  return new File(Paths.document, STATE_FILE)
}

/**
 * Read the persisted state, or null if none exists yet or it
 * cannot be parsed. Never throws, so a corrupt file degrades
 * to a fresh start rather than a crash.
 */

export async function loadPersistedState(): Promise<PersistedState | null> {
  try {
    const file = stateFile()
    if (!file.exists) {
      return null
    }
    const text = await file.text()
    const document = JSON.parse(text) as Partial<PersistedDocument>
    // Ignore documents from an older shape, so stale state
    // (including any previously-seeded sample songs) is dropped.
    if (document.version !== STATE_VERSION) {
      return null
    }
    return {
      songs: document.songs ?? {},
      sections: document.sections ?? {},
      takes: document.takes ?? {},
      serverUrl: document.serverUrl,
    }
  } catch (error) {
    if (error instanceof Error) {
      console.warn('beat: failed to load state', error.message)
    }
    return null
  }
}

/**
 * Write the persisted state. Synchronous (the new file API
 * writes synchronously) and best-effort: a failure is logged,
 * not thrown, so a save error never breaks a user action.
 */

export function savePersistedState(state: PersistedState): void {
  try {
    const file = stateFile()
    if (!file.exists) {
      file.create()
    }
    const document: PersistedDocument = {
      version: STATE_VERSION,
      songs: state.songs,
      sections: state.sections,
      takes: state.takes,
      serverUrl: state.serverUrl,
    }
    file.write(JSON.stringify(document))
  } catch (error) {
    if (error instanceof Error) {
      console.warn('beat: failed to save state', error.message)
    }
  }
}

function audioDirectory(): Directory {
  const dir = new Directory(Paths.document, AUDIO_DIR)
  if (!dir.exists) {
    dir.create()
  }
  return dir
}

/**
 * Copy a picked audio file into durable storage and return
 * the new stable uri. The name is prefixed with a fresh id so
 * two imports of the same filename never collide.
 */

export function importAudioFile({
  sourceUri,
  fileName,
}: {
  sourceUri: string
  fileName: string
}): string {
  const directory = audioDirectory()
  const source = new File(sourceUri)
  const destination = new File(directory, `${createId('audio')}-${fileName}`)
  source.copy(destination)
  return destination.uri
}

/**
 * Delete an audio file from storage. Best-effort: a missing
 * file or a failure is ignored, since the metadata removal is
 * what matters to the user.
 */

export function deleteAudioFile(uri: string): void {
  try {
    const file = new File(uri)
    if (file.exists) {
      file.delete()
    }
  } catch (error) {
    if (error instanceof Error) {
      console.warn('beat: failed to delete audio', error.message)
    }
  }
}

/**
 * Download an audio file from a URL (the laptop import server)
 * into durable storage and return its uri. Used by the
 * "Import from laptop" flow.
 */

export async function downloadAudioFromUrl({
  url,
  fileName,
}: {
  url: string
  fileName: string
}): Promise<string> {
  const directory = audioDirectory()
  const destination = new File(directory, `${createId('audio')}-${fileName}`)
  const downloaded = await File.downloadFileAsync(url, destination, {
    idempotent: true,
  })
  return downloaded.uri
}

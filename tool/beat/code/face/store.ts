/**
 * The single store for beat.
 *
 * State is held in memory and persisted to a JSON document on
 * device (see code/node/storage) so imported songs and
 * recorded takes survive an app reload. On launch the store
 * starts empty, then hydrate() loads the persisted document if
 * one exists.
 *
 * Songs enter only through importSong (document-picker import).
 * There is no sample or placeholder data.
 */

import { create } from 'zustand'
import { createId } from '@/base/ids'
import { Rating } from '@/base/types'
import type { Section, Song, Take } from '@/base/types'
import type { SongDefinition } from '@/base/define'
import { buildSong } from '@/base/import'
import {
  deleteAudioFile,
  loadPersistedState,
  savePersistedState,
} from '@/node/storage'

/**
 * The empty initial state. The app starts with no songs;
 * real songs arrive only through importSong (or hydration of
 * previously imported songs). There is no sample data.
 */

function initial(): {
  songs: Record<string, Song>
  sections: Record<string, Section>
  takes: Record<string, Take>
} {
  return { songs: {}, sections: {}, takes: {} }
}

/**
 * Store shape. State holds stable map references and the
 * two actions. Derived lists (sections for a song, takes
 * for a section) are computed in the screens from these
 * maps, not via selectors. That keeps zustand v5 selectors
 * returning stable references and avoids the
 * useSyncExternalStore infinite-loop guard.
 */

export type BeatState = {
  songs: Record<string, Song>
  sections: Record<string, Section>
  takes: Record<string, Take>
  /** Remembered laptop import-server URL. */
  serverUrl?: string

  /** Load persisted state from disk into the empty store. */
  hydrate(): Promise<void>
  /** Remember the laptop import-server URL. */
  setServerUrl(url: string): void
  /** Import a song (with optional base audio). Returns it. */
  importSong(input: {
    definition: SongDefinition
    audioUri?: string
  }): Song
  /** Record a new take against a section. Returns it. */
  addTake(input: {
    songId: string
    sectionId: string
    recordingUri?: string
    durationMs?: number
  }): Take
  /** Set the rating on an existing take. */
  rateTake(input: { takeId: string; rating: Rating }): void
  /** Delete a take and its audio file. */
  removeTake(takeId: string): void
  /** Delete a song and all its sections, takes, and audio. */
  removeSong(songId: string): void
}

/**
 * Helper used by the screens: a song's sections in display
 * order. Pure over the stable maps so screens can select
 * the maps and derive the list in render.
 */

export function orderSections({
  song,
  sections,
}: {
  song?: Song
  sections: Record<string, Section>
}): Section[] {
  if (!song) {
    return []
  }
  return song.sectionIds
    .map(id => sections[id])
    .filter((section): section is Section => Boolean(section))
}

/** Helper: takes for a section, newest first. */

export function takesForSection({
  takes,
  sectionId,
}: {
  takes: Record<string, Take>
  sectionId: string
}): Take[] {
  return Object.values(takes)
    .filter(take => take.sectionId === sectionId)
    .sort((a, b) => b.createdAt - a.createdAt)
}

/** Persist the current serializable slice of the store. */

function persist(state: BeatState): void {
  savePersistedState({
    songs: state.songs,
    sections: state.sections,
    takes: state.takes,
    serverUrl: state.serverUrl,
  })
}

export const useBeatStore = create<BeatState>((set, get) => ({
  ...initial(),

  async hydrate() {
    const persisted = await loadPersistedState()
    if (persisted) {
      set({
        songs: persisted.songs,
        sections: persisted.sections,
        takes: persisted.takes,
        serverUrl: persisted.serverUrl,
      })
    }
  },

  setServerUrl(url) {
    set({ serverUrl: url })
    persist(get())
  },

  importSong({ definition, audioUri }) {
    const built = buildSong({ definition, audioUri })
    set(state => {
      const sections = { ...state.sections }
      built.sections.forEach(section => {
        sections[section.id] = section
      })
      return {
        songs: { ...state.songs, [built.song.id]: built.song },
        sections,
      }
    })
    persist(get())
    return built.song
  },

  addTake({ songId, sectionId, recordingUri, durationMs }) {
    const section = get().sections[sectionId]
    const take: Take = {
      id: createId('take'),
      songId,
      sectionId,
      recordingUri,
      durationMs,
      recordedAtSongPositionMs: section?.startMs ?? 0,
      rating: Rating.None,
      // Monotonic-ish counter stands in for a real clock so
      // the hello-world build avoids Date in module init.
      createdAt: Object.keys(get().takes).length + 1,
    }
    set(state => ({ takes: { ...state.takes, [take.id]: take } }))
    persist(get())
    return take
  },

  rateTake({ takeId, rating }) {
    set(state => {
      const take = state.takes[takeId]
      if (!take) {
        return state
      }
      return {
        takes: { ...state.takes, [takeId]: { ...take, rating } },
      }
    })
    persist(get())
  },

  removeTake(takeId) {
    const take = get().takes[takeId]
    if (take?.recordingUri) {
      deleteAudioFile(take.recordingUri)
    }
    set(state => {
      const takes = { ...state.takes }
      delete takes[takeId]
      return { takes }
    })
    persist(get())
  },

  removeSong(songId) {
    const state = get()
    const song = state.songs[songId]
    if (!song) {
      return
    }
    // Remove the base audio and every take's recording on disk.
    if (song.audioUri) {
      deleteAudioFile(song.audioUri)
    }
    Object.values(state.takes).forEach(take => {
      if (take.songId === songId && take.recordingUri) {
        deleteAudioFile(take.recordingUri)
      }
    })
    set(current => {
      const songs = { ...current.songs }
      delete songs[songId]
      const sections = { ...current.sections }
      Object.keys(sections).forEach(id => {
        if (sections[id]?.songId === songId) {
          delete sections[id]
        }
      })
      const takes = { ...current.takes }
      Object.keys(takes).forEach(id => {
        if (takes[id]?.songId === songId) {
          delete takes[id]
        }
      })
      return { songs, sections, takes }
    })
    persist(get())
  },
}))

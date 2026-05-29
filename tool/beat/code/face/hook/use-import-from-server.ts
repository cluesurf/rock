/**
 * Import songs from the laptop over Wi-Fi.
 *
 * The laptop runs `task/serve.ts`, which serves the song
 * bundles in a folder. This hook fetches that server's index
 * (songs with their sections and an audio URL), and imports a
 * chosen song by downloading its audio into durable storage
 * and adding it to the store. No AirDrop, no cloud, just the
 * same local network the Expo Go dev workflow already uses.
 */

import { useCallback } from 'react'
import { useBeatStore } from '@/face/store'
import { downloadAudioFromUrl } from '@/node/storage'
import { parseSongDefinition } from '@/base/import'
import type { SectionInput } from '@/base/define'

/** A song as listed by the laptop import server. */

export type ServerSong = {
  name: string
  sections: SectionInput[]
  audioUrl: string
}

/** Normalize a typed base URL: add http:// and drop a trailing slash. */

function normalizeBaseUrl(url: string): string {
  const trimmed = url.trim().replace(/\/+$/, '')
  return /^https?:\/\//.test(trimmed) ? trimmed : `http://${trimmed}`
}

/** Derive a filename from an audio URL. */

function fileNameFromUrl(url: string): string {
  const last = url.split('/').pop() ?? 'song.mp3'
  return decodeURIComponent(last)
}

export type ServerImporter = {
  /** List the songs the laptop server is offering. */
  fetchSongs(baseUrl: string): Promise<ServerSong[]>
  /** Download and import one server song. Returns its id. */
  importServerSong(song: ServerSong): Promise<string>
}

export function useImportFromServer(): ServerImporter {
  const importSong = useBeatStore(state => state.importSong)

  const fetchSongs = useCallback(async (baseUrl: string) => {
    const response = await fetch(`${normalizeBaseUrl(baseUrl)}/index.json`)
    if (!response.ok) {
      throw new Error(`server responded ${response.status}`)
    }
    const data = (await response.json()) as { songs?: ServerSong[] }
    return data.songs ?? []
  }, [])

  const importServerSong = useCallback(
    async (song: ServerSong) => {
      const audioUri = await downloadAudioFromUrl({
        url: song.audioUrl,
        fileName: fileNameFromUrl(song.audioUrl),
      })
      const definition =
        parseSongDefinition({ name: song.name, sections: song.sections }) ?? {
          name: song.name,
          sections: [{ name: 'Full song', startMs: 0 }],
        }
      const result = importSong({ definition, audioUri })
      return result.id
    },
    [importSong],
  )

  return { fetchSongs, importServerSong }
}

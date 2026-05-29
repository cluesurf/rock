/**
 * Song import flow. Wraps the document picker so the user can
 * bring a song into beat from the phone's Files / iCloud Drive
 * (where a Logic bounce lands after AirDrop):
 *
 *   1. Pick the audio file (m4a / mp3).
 *   2. Optionally pick the sections sidecar JSON produced by
 *      task/sections-from-logic.ts. If skipped, the song gets
 *      one full-length section so it is still usable.
 *   3. Copy the audio into durable storage.
 *   4. Add the song to the store (which persists it).
 *
 * Returns the new song id, or null if the user canceled the
 * audio pick.
 */

import { useCallback } from 'react'
import { Alert } from 'react-native'
import * as DocumentPicker from 'expo-document-picker'
import { File } from 'expo-file-system'
import { useBeatStore } from '@/face/store'
import { importAudioFile } from '@/node/storage'
import { parseSongDefinition } from '@/base/import'
import type { SongDefinition } from '@/base/define'

/** Strip a file extension to make a default song name. */

function nameFromFile(fileName: string): string {
  return fileName.replace(/\.[^.]+$/, '')
}

export function useImportSong(): () => Promise<string | null> {
  const importSong = useBeatStore(state => state.importSong)

  return useCallback(async () => {
    // 1. Pick the audio file.
    const audio = await DocumentPicker.getDocumentAsync({
      type: 'audio/*',
      copyToCacheDirectory: true,
    })
    const asset = audio.canceled ? null : audio.assets[0]
    if (!asset) {
      return null
    }

    // 2. Optional sections sidecar. Default to one section.
    let definition: SongDefinition = {
      name: nameFromFile(asset.name),
      sections: [{ name: 'Full song', startMs: 0 }],
    }
    const sidecar = await DocumentPicker.getDocumentAsync({
      type: 'application/json',
      copyToCacheDirectory: true,
    })
    const sidecarAsset = sidecar.canceled ? null : sidecar.assets[0]
    if (sidecarAsset) {
      try {
        const text = await new File(sidecarAsset.uri).text()
        const parsed = parseSongDefinition(JSON.parse(text))
        if (parsed && parsed.sections.length > 0) {
          definition = parsed
        }
      } catch (error) {
        if (error instanceof Error) {
          Alert.alert(
            'Sections file',
            'Could not read that sections file, so the song was imported with one section.',
          )
        }
      }
    }

    // 3. Copy audio into durable storage, 4. add to store.
    const audioUri = importAudioFile({
      sourceUri: asset.uri,
      fileName: asset.name,
    })
    const song = importSong({ definition, audioUri })
    return song.id
  }, [importSong])
}

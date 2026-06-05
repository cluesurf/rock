/**
 * Projects screen. The home of the app: a list of songs.
 * Tap one to open it. This is a thin route wrapper over the
 * store and shared components, following the pattern where
 * routes stay thin and logic lives in code/.
 */

import { Alert, StyleSheet, Text } from 'react-native'
import { useRouter } from 'expo-router'
import { useBeatStore } from '@/face/store'
import { useImportSong } from '@/face/hook/use-import-song'
import type { Song } from '@/base/types'
import { THEME, FONT_MONO } from '@/face/theme'
import Screen from '@/face/component/screen'
import TapButton from '@/face/component/tap-button'

export default function ProjectsScreen() {
  const router = useRouter()
  // Select the stable map, derive the list in render.
  const songs = useBeatStore(state => state.songs)
  const removeSong = useBeatStore(state => state.removeSong)
  const list = Object.values(songs)
  const importSong = useImportSong()

  const confirmDelete = (song: Song) => {
    Alert.alert('Delete song', `Delete "${song.name}" and all its takes?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => removeSong(song.id),
      },
    ])
  }

  /** Pick an audio file (and optional sections), then open it. */
  const onImport = async () => {
    const id = await importSong()
    if (id) {
      router.push(`/project/${id}`)
    }
  }

  return (
    <Screen title="Beat" subtitle="a musical sketchbook">
      {list.length === 0 ? (
        <Text style={styles.empty}>
          No songs yet. Import a song to start sketching.
        </Text>
      ) : (
        list.map(song => (
          <TapButton
            key={song.id}
            label={song.name}
            detail={`${song.sectionIds.length} sections`}
            onPress={() => router.push(`/project/${song.id}`)}
            onLongPress={() => confirmDelete(song)}
          />
        ))
      )}
      {list.length > 0 ? (
        <Text style={styles.hint}>Long-press a song to delete it.</Text>
      ) : null}
      <TapButton
        label="+ Import from laptop"
        variant="primary"
        onPress={() => router.push('/import')}
      />
      <TapButton label="+ Import from Files" onPress={onImport} />
    </Screen>
  )
}

const styles = StyleSheet.create({
  empty: {
    fontFamily: FONT_MONO,
    fontSize: 15,
    color: THEME.textMuted,
    paddingVertical: 12,
  },
  hint: {
    fontFamily: FONT_MONO,
    fontSize: 12,
    color: THEME.textMuted,
    textAlign: 'center',
    marginTop: 8,
  },
})


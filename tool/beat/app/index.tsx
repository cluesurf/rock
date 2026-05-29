/**
 * Projects screen. The home of the app: a list of songs.
 * Tap one to open it. This is a thin route wrapper over the
 * store and shared components, following the pattern where
 * routes stay thin and logic lives in code/.
 */

import { StyleSheet, Text } from 'react-native'
import { useRouter } from 'expo-router'
import { useBeatStore } from '@/face/store'
import { useImportSong } from '@/face/hook/use-import-song'
import { THEME, FONT_MONO } from '@/face/theme'
import Screen from '@/face/component/screen'
import TapButton from '@/face/component/tap-button'

export default function ProjectsScreen() {
  const router = useRouter()
  // Select the stable map, derive the list in render.
  const songs = useBeatStore(state => state.songs)
  const list = Object.values(songs)
  const importSong = useImportSong()

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
          />
        ))
      )}
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
})


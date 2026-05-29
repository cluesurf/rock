/**
 * Import-from-laptop screen.
 *
 * Connects to the laptop's `task/serve.ts` server over Wi-Fi,
 * lists the songs it offers, and imports the one you tap by
 * downloading its audio straight into the app. Replaces
 * AirDrop. The server URL is remembered between launches.
 */

import { useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import { useRouter } from 'expo-router'
import { useBeatStore } from '@/face/store'
import {
  useImportFromServer,
  type ServerSong,
} from '@/face/hook/use-import-from-server'
import { THEME, FONT_MONO } from '@/face/theme'
import Screen from '@/face/component/screen'
import TapButton from '@/face/component/tap-button'

export default function ImportScreen() {
  const router = useRouter()
  const savedUrl = useBeatStore(state => state.serverUrl)
  const setServerUrl = useBeatStore(state => state.setServerUrl)
  const { fetchSongs, importServerSong } = useImportFromServer()

  const [url, setUrl] = useState(savedUrl ?? '')
  const [songs, setSongs] = useState<ServerSong[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const onConnect = async () => {
    setBusy(true)
    setError(null)
    setServerUrl(url)
    try {
      setSongs(await fetchSongs(url))
    } catch (caught) {
      if (caught instanceof Error) {
        setError(caught.message)
      }
      setSongs(null)
    } finally {
      setBusy(false)
    }
  }

  const onImport = async (song: ServerSong) => {
    setBusy(true)
    try {
      const id = await importServerSong(song)
      router.replace(`/project/${id}`)
    } catch (caught) {
      if (caught instanceof Error) {
        Alert.alert('Import failed', caught.message)
      }
      setBusy(false)
    }
  }

  return (
    <Screen title="Import" subtitle="from your laptop over Wi-Fi">
      <Text style={styles.help}>
        On the laptop run task/serve.ts, then enter the address it prints.
      </Text>
      <TextInput
        value={url}
        onChangeText={setUrl}
        placeholder="http://192.168.1.95:7777"
        placeholderTextColor={THEME.textMuted}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="url"
        style={styles.input}
      />
      <TapButton
        label={busy ? 'Working...' : 'Connect'}
        variant="primary"
        disabled={busy || url.trim().length === 0}
        onPress={onConnect}
      />

      {busy ? <ActivityIndicator color={THEME.primary} /> : null}
      {error ? <Text style={styles.error}>Could not connect. {error}</Text> : null}

      {songs && songs.length === 0 ? (
        <Text style={styles.help}>No songs on the server yet.</Text>
      ) : null}
      {songs?.map((song, index) => (
        <TapButton
          key={`${song.name}-${index}`}
          label={song.name}
          detail={`${song.sections.length} sections`}
          disabled={busy}
          onPress={() => onImport(song)}
        />
      ))}
    </Screen>
  )
}

const styles = StyleSheet.create({
  help: {
    fontFamily: FONT_MONO,
    fontSize: 13,
    color: THEME.textMuted,
  },
  input: {
    fontFamily: FONT_MONO,
    fontSize: 16,
    color: THEME.text,
    backgroundColor: THEME.surface,
    borderColor: THEME.border,
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  error: {
    fontFamily: FONT_MONO,
    fontSize: 13,
    color: THEME.down,
  },
})

/**
 * Recorder screen. The capture surface for a selection of one
 * or more sections.
 *
 * The selected parts loop against the base track (LoopControl:
 * tap to toggle, drag to set volume). The big button records
 * real mic audio over the loop. The rapid-takes flow:
 *
 *   - Each time the loop wraps back to the start, the current
 *     recording is banked as a take and a fresh one begins, so
 *     repeated passes become separate takes hands-free.
 *   - "New take" cuts the current take and restarts the loop
 *     from the top immediately, for a deliberate retake.
 *
 * A saved take attaches to the first selected section. Takes
 * persist to disk via the store.
 */

import { useCallback, useRef, useState } from 'react'
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useBeatStore, orderSections } from '@/face/store'
import { useRecorder } from '@/face/hook/use-recorder'
import { useLoopPlayer } from '@/face/hook/use-loop-player'
import { buildLoopSegments } from '@/base/loop'
import { formatClock } from '@/base/time'
import { THEME, FONT_MONO } from '@/face/theme'
import Screen from '@/face/component/screen'
import TapButton from '@/face/component/tap-button'
import LoopControl from '@/face/component/loop-control'

export default function RecordScreen() {
  const { id, sections: sectionsParam } = useLocalSearchParams<{
    id: string
    sections: string
  }>()
  const router = useRouter()
  const selectedIds = (sectionsParam ?? '').split(',').filter(Boolean)
  const firstSectionId = selectedIds[0]

  const song = useBeatStore(state => state.songs[id])
  const sectionMap = useBeatStore(state => state.sections)
  const addTake = useBeatStore(state => state.addTake)
  const orderedSections = orderSections({ song, sections: sectionMap })
  const firstSection = sectionMap[firstSectionId]
  const segments = buildLoopSegments({
    sections: orderedSections,
    selectedIds,
  })

  const { isRecording, durationMs, start, stop } = useRecorder()
  const [lastTakeNumber, setLastTakeNumber] = useState<number | null>(null)

  // Refs let the loop's onWrap callback read fresh state without
  // re-creating the loop player every render.
  const recordingRef = useRef(false)
  recordingRef.current = isRecording
  const cuttingRef = useRef(false)

  // Bank the current take (if recording) and start a fresh one.
  // Used by both the manual New take button and the auto-cut on
  // each loop wrap. Guarded against overlapping runs.
  const cutTake = useCallback(async () => {
    if (cuttingRef.current || !recordingRef.current) {
      return
    }
    cuttingRef.current = true
    try {
      const result = await stop()
      if (result) {
        const take = addTake({
          songId: id,
          sectionId: firstSectionId,
          recordingUri: result.uri,
          durationMs: result.durationMs,
        })
        setLastTakeNumber(take.createdAt)
      }
      await start()
    } finally {
      cuttingRef.current = false
    }
  }, [stop, start, addTake, id, firstSectionId])

  const loop = useLoopPlayer(song?.audioUri, cutTake)

  if (!firstSection) {
    return <Screen title="Not found" />
  }

  const isMulti = selectedIds.length > 1
  const title = isMulti
    ? `${firstSection.name} +${selectedIds.length - 1}`
    : firstSection.name

  // Big button: start or stop recording (and bank the take on stop).
  const onRecordToggle = async () => {
    if (isRecording) {
      const result = await stop()
      if (result) {
        const take = addTake({
          songId: id,
          sectionId: firstSectionId,
          recordingUri: result.uri,
          durationMs: result.durationMs,
        })
        setLastTakeNumber(take.createdAt)
      }
    } else {
      setLastTakeNumber(null)
      const started = await start()
      if (!started) {
        Alert.alert(
          'Microphone needed',
          'Enable microphone access for beat to record takes.',
        )
      }
    }
  }

  // Manual retake: restart the loop from the top and cut a take.
  const onNewTake = async () => {
    loop.restart()
    await cutTake()
  }

  return (
    <Screen
      title={title}
      subtitle={isMulti ? `looping ${selectedIds.length} parts` : 'record an idea'}
    >
      {loop.hasAudio ? (
        <LoopControl
          isLooping={loop.isLooping}
          volume={loop.volume}
          onToggle={() =>
            loop.isLooping ? loop.stop() : loop.start(segments)
          }
          onVolumeChange={loop.setVolume}
        />
      ) : null}

      <Pressable
        onPress={onRecordToggle}
        style={({ pressed }) => [
          styles.record,
          isRecording && styles.recording,
          pressed && styles.pressed,
        ]}
      >
        <Text style={styles.recordLabel}>
          {isRecording ? 'Stop' : lastTakeNumber ? 'Retake' : 'Record'}
        </Text>
        {isRecording ? (
          <Text style={styles.timer}>{formatClock(durationMs)}</Text>
        ) : null}
      </Pressable>

      {isRecording ? (
        <TapButton label="↺ New take" onPress={onNewTake} />
      ) : null}

      {lastTakeNumber !== null && !isRecording ? (
        <View style={styles.saved}>
          <Text style={styles.savedText}>Take {lastTakeNumber} saved</Text>
        </View>
      ) : null}

      <TapButton
        label="Review takes"
        variant="primary"
        onPress={() => router.push(`/project/${id}/review`)}
      />
    </Screen>
  )
}

const styles = StyleSheet.create({
  record: {
    backgroundColor: THEME.text,
    borderRadius: 999,
    aspectRatio: 1,
    alignSelf: 'center',
    width: '70%',
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 24,
  },
  recording: {
    backgroundColor: THEME.down,
  },
  pressed: {
    opacity: 0.7,
  },
  recordLabel: {
    fontFamily: FONT_MONO,
    fontSize: 28,
    fontWeight: '700',
    color: '#ffffff',
    letterSpacing: 1,
  },
  timer: {
    fontFamily: FONT_MONO,
    fontSize: 18,
    color: '#ffffff',
    marginTop: 8,
    opacity: 0.85,
  },
  saved: {
    alignItems: 'center',
    marginBottom: 8,
  },
  savedText: {
    fontFamily: FONT_MONO,
    fontSize: 15,
    color: THEME.up,
  },
})

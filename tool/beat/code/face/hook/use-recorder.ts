/**
 * Recording hook. Wraps expo-audio so screens never touch
 * the audio module directly (the same boundary the plan
 * describes for the AudioEngine). It owns microphone
 * permission, the recording audio mode, and the
 * record/stop lifecycle, and reports live recording state.
 *
 * On stop it returns the on-device file uri and the
 * measured duration, which the caller saves onto a take.
 */

import { useCallback } from 'react'
import {
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioRecorder,
  useAudioRecorderState,
} from 'expo-audio'

/** What a finished recording yields. */

export type RecordedTake = {
  uri: string
  durationMs: number
}

export type Recorder = {
  /** True while actively recording. */
  isRecording: boolean
  /** Elapsed milliseconds of the current recording. */
  durationMs: number
  /** Begin recording. Returns false if mic permission denied. */
  start(): Promise<boolean>
  /** Stop recording. Returns the file and duration, or null. */
  stop(): Promise<RecordedTake | null>
}

export function useRecorder(): Recorder {
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY)
  const state = useAudioRecorderState(recorder)

  const start = useCallback(async () => {
    const permission = await requestRecordingPermissionsAsync()
    if (!permission.granted) {
      return false
    }
    // Allow capture, and keep audio audible even with the
    // hardware silent switch on, so playback later is heard.
    await setAudioModeAsync({
      allowsRecording: true,
      playsInSilentMode: true,
    })
    await recorder.prepareToRecordAsync()
    recorder.record()
    return true
  }, [recorder])

  const stop = useCallback(async () => {
    await recorder.stop()
    const uri = recorder.uri
    if (!uri) {
      return null
    }
    return { uri, durationMs: Math.round(state.durationMillis ?? 0) }
  }, [recorder, state.durationMillis])

  return {
    isRecording: state.isRecording,
    durationMs: Math.round(state.durationMillis ?? 0),
    start,
    stop,
  }
}

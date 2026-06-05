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
  /** Live input level, 0 (silence) to 1 (loud), for a meter. */
  level: number
  /** Begin recording. Returns false if mic permission denied. */
  start(): Promise<boolean>
  /** Stop recording. Returns the file and duration, or null. */
  stop(): Promise<RecordedTake | null>
}

/** Quietest input (dBFS) the meter shows as non-zero. */

const METER_FLOOR_DB = -60

export function useRecorder(): Recorder {
  // Metering on so the screen can show a live input level.
  const recorder = useAudioRecorder({
    ...RecordingPresets.HIGH_QUALITY,
    isMeteringEnabled: true,
  })
  const state = useAudioRecorderState(recorder)

  const start = useCallback(async () => {
    const permission = await requestRecordingPermissionsAsync()
    if (!permission.granted) {
      return false
    }
    // Allow capture, keep audio audible with the silent switch
    // on, and force the loud bottom speaker. Recording puts iOS
    // in PlayAndRecord, which otherwise routes playback to the
    // quiet earpiece.
    const recordingMode = {
      allowsRecording: true,
      playsInSilentMode: true,
      shouldRouteThroughEarpiece: false,
    }
    await setAudioModeAsync(recordingMode)
    await recorder.prepareToRecordAsync()
    recorder.record()
    // Starting the recorder reconfigures the iOS audio session
    // and flips output back to the earpiece, so re-assert the
    // speaker route now that PlayAndRecord is active. This keeps
    // the loop loud during and after recording.
    await setAudioModeAsync(recordingMode)
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

  // Map the metering dBFS value (negative, 0 is loudest) to a
  // 0..1 bar level.
  const metering = state.metering ?? METER_FLOOR_DB
  const level = Math.max(
    0,
    Math.min(1, (metering - METER_FLOOR_DB) / -METER_FLOOR_DB),
  )

  return {
    isRecording: state.isRecording,
    durationMs: Math.round(state.durationMillis ?? 0),
    level,
    start,
    stop,
  }
}

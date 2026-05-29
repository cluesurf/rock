/**
 * Looped segment playback. Plays a list of loop segments in
 * order against the base track, then repeats from the first,
 * so the user can loop one section or an arbitrary sequence of
 * selected sections while jamming or recording over them.
 *
 * expo-audio has no native sub-range loop, so this watches the
 * playback position (polled tightly via the status update
 * interval) and seeks to the next segment when the current one
 * ends, wrapping to the first. A single-segment selection is
 * just a one-element loop.
 *
 * `onWrap` fires each time the loop returns to the first
 * segment, which the recorder uses to auto-cut a take per pass.
 * `volume` (0..1) controls base-track playback level.
 *
 * When the song has no audio (no base track), hasAudio is false
 * and the controls are no-ops.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio'
import type { LoopSegment } from '@/base/loop'

/** How often the player reports position. Tighter means crisper loop boundaries. */

const STATUS_UPDATE_MS = 100

/** Default base-track volume. */

const DEFAULT_VOLUME = 1

export type LoopPlayer = {
  /** Whether a base track is loaded. */
  hasAudio: boolean
  /** Whether a loop is currently playing. */
  isLooping: boolean
  /** Current base-track volume, 0..1. */
  volume: number
  /** Play the given segments in order, looping. */
  start(segments: LoopSegment[]): void
  /** Stop playback. */
  stop(): void
  /** Jump back to the start of the loop and keep playing. */
  restart(): void
  /** Set base-track volume, 0..1 (clamped). */
  setVolume(value: number): void
}

export function useLoopPlayer(uri?: string, onWrap?: () => void): LoopPlayer {
  const player = useAudioPlayer(uri ? { uri } : null, {
    updateInterval: STATUS_UPDATE_MS,
  })
  const status = useAudioPlayerStatus(player)

  const segmentsRef = useRef<LoopSegment[]>([])
  const indexRef = useRef(0)
  const volumeRef = useRef(DEFAULT_VOLUME)
  const onWrapRef = useRef(onWrap)
  onWrapRef.current = onWrap

  const [isLooping, setIsLooping] = useState(false)
  const [volume, setVolumeValue] = useState(DEFAULT_VOLUME)

  const start = useCallback(
    (segments: LoopSegment[]) => {
      if (!uri || segments.length === 0) {
        return
      }
      segmentsRef.current = segments
      indexRef.current = 0
      player.volume = volumeRef.current
      player.seekTo(segments[0].startMs / 1000)
      player.play()
      setIsLooping(true)
    },
    [player, uri],
  )

  const stop = useCallback(() => {
    player.pause()
    setIsLooping(false)
  }, [player])

  const restart = useCallback(() => {
    const segments = segmentsRef.current
    if (segments.length === 0) {
      return
    }
    indexRef.current = 0
    player.seekTo(segments[0].startMs / 1000)
    player.play()
  }, [player])

  const setVolume = useCallback(
    (value: number) => {
      const clamped = Math.max(0, Math.min(1, value))
      volumeRef.current = clamped
      setVolumeValue(clamped)
      player.volume = clamped
    },
    [player],
  )

  // Advance to the next segment (wrapping to the first) when the
  // current segment's end is reached. On wrap, fire onWrap.
  useEffect(() => {
    if (!isLooping) {
      return
    }
    const segments = segmentsRef.current
    const current = segments[indexRef.current]
    if (!current) {
      return
    }
    const positionMs = status.currentTime * 1000
    if (positionMs >= current.endMs) {
      const nextIndex = (indexRef.current + 1) % segments.length
      indexRef.current = nextIndex
      player.seekTo(segments[nextIndex].startMs / 1000)
      if (nextIndex === 0) {
        onWrapRef.current?.()
      }
    }
  }, [status.currentTime, isLooping, player])

  return { hasAudio: Boolean(uri), isLooping, volume, start, stop, restart, setVolume }
}

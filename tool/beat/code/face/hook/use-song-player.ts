/**
 * Base-track playback hook. Wraps an expo-audio player loaded
 * with a song's base audio, so a section can be heard while
 * recording an idea over it. Seeking takes milliseconds (the
 * unit the rest of the app uses) and converts to the seconds
 * expo-audio expects.
 *
 * When the song has no audio (the seeded samples), hasAudio is
 * false and the controls are no-ops, so callers can hide the
 * transport.
 */

import { useCallback } from 'react'
import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio'

export type SongPlayer = {
  /** Whether a base track is loaded. */
  hasAudio: boolean
  /** Whether the base track is currently playing. */
  isPlaying: boolean
  /** Seek to a position in milliseconds and play. */
  playFromMs(ms: number): void
  /** Pause playback. */
  pause(): void
}

export function useSongPlayer(uri?: string): SongPlayer {
  const player = useAudioPlayer(uri ? { uri } : null)
  const status = useAudioPlayerStatus(player)

  const playFromMs = useCallback(
    (ms: number) => {
      player.seekTo(ms / 1000)
      player.play()
    },
    [player],
  )

  const pause = useCallback(() => {
    player.pause()
  }, [player])

  return {
    hasAudio: Boolean(uri),
    isPlaying: status.playing,
    playFromMs,
    pause,
  }
}

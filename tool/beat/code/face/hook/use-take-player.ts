/**
 * Take playback hook. Wraps a single expo-audio player that
 * the review screen reuses to play whichever take the user
 * taps. Keeping one player (rather than one per row) avoids
 * calling a hook inside a list, and matches how only one
 * take plays at a time.
 */

import { useCallback } from 'react'
import { useAudioPlayer } from 'expo-audio'

export type TakePlayer = {
  /** Load a take's recording and play it from the start. */
  play(uri: string): void
  /** Pause the current playback. */
  pause(): void
}

export function useTakePlayer(): TakePlayer {
  // Start with no source. We swap the source per take via
  // replace() so the same player serves every row.
  const player = useAudioPlayer(null)

  const play = useCallback(
    (uri: string) => {
      player.replace({ uri })
      player.seekTo(0)
      player.play()
    },
    [player],
  )

  const pause = useCallback(() => {
    player.pause()
  }, [player])

  return { play, pause }
}

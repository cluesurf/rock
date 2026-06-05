/**
 * Take playback for the Review screen. One expo-audio player
 * serves every take (only one plays at a time), and supports:
 *
 *   - playOne(uri): play a single take, with stop.
 *   - playSequence(uris): A/B compare, playing takes back-to-
 *     back so you can hear which idea wins.
 *
 * `activeUri` tells the UI which take is currently sounding, so
 * the row can show a stop control. The sequence advances on
 * each take finishing (didJustFinish).
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio'

export type TakePlayer = {
  /** The uri currently playing, or null. */
  activeUri: string | null
  /** Whether playback is sounding. */
  isPlaying: boolean
  /** Play a single take from the start. */
  playOne(uri: string): void
  /** Play several takes back-to-back (A/B compare). */
  playSequence(uris: string[]): void
  /** Stop playback and clear any compare queue. */
  stop(): void
}

export function useTakePlayer(): TakePlayer {
  const player = useAudioPlayer(null)
  const status = useAudioPlayerStatus(player)

  const queueRef = useRef<string[]>([])
  const indexRef = useRef(0)
  const [activeUri, setActiveUri] = useState<string | null>(null)

  const playUri = useCallback(
    (uri: string) => {
      player.replace({ uri })
      player.seekTo(0)
      player.play()
      setActiveUri(uri)
    },
    [player],
  )

  const playOne = useCallback(
    (uri: string) => {
      queueRef.current = []
      indexRef.current = 0
      playUri(uri)
    },
    [playUri],
  )

  const playSequence = useCallback(
    (uris: string[]) => {
      if (uris.length === 0) {
        return
      }
      queueRef.current = uris
      indexRef.current = 0
      playUri(uris[0])
    },
    [playUri],
  )

  const stop = useCallback(() => {
    player.pause()
    queueRef.current = []
    setActiveUri(null)
  }, [player])

  // Advance the compare queue when the current take finishes.
  useEffect(() => {
    if (!status.didJustFinish) {
      return
    }
    const queue = queueRef.current
    const next = indexRef.current + 1
    if (queue.length > 0 && next < queue.length) {
      indexRef.current = next
      playUri(queue[next])
    } else {
      setActiveUri(null)
    }
  }, [status.didJustFinish, playUri])

  return { activeUri, isPlaying: status.playing, playOne, playSequence, stop }
}

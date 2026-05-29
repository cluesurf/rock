/**
 * The loop transport. Tap to start or stop the loop. Drag left
 * or right across it to lower or raise the base-track volume,
 * shown as a fill behind the label, so you can balance the
 * backing track against your voice without leaving the screen.
 */

import { useMemo, useRef } from 'react'
import { PanResponder, StyleSheet, Text, View } from 'react-native'
import { THEME, FONT_MONO } from '@/face/theme'

/** Horizontal movement (px) before a touch counts as a drag, not a tap. */

const MOVE_THRESHOLD = 6

export type LoopControlProps = {
  isLooping: boolean
  /** Current base-track volume, 0..1. */
  volume: number
  onToggle: () => void
  onVolumeChange(value: number): void
}

export default function LoopControl({
  isLooping,
  volume,
  onToggle,
  onVolumeChange,
}: LoopControlProps) {
  const widthRef = useRef(1)
  const movedRef = useRef(false)
  const startVolumeRef = useRef(volume)
  // Keep the latest volume readable inside the (memoized) responder.
  const volumeRef = useRef(volume)
  volumeRef.current = volume

  const responder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: (_event, gesture) =>
          Math.abs(gesture.dx) > MOVE_THRESHOLD,
        onPanResponderGrant: () => {
          movedRef.current = false
          startVolumeRef.current = volumeRef.current
        },
        onPanResponderMove: (_event, gesture) => {
          if (Math.abs(gesture.dx) > MOVE_THRESHOLD) {
            movedRef.current = true
          }
          if (movedRef.current) {
            onVolumeChange(startVolumeRef.current + gesture.dx / widthRef.current)
          }
        },
        onPanResponderRelease: () => {
          if (!movedRef.current) {
            onToggle()
          }
        },
      }),
    [onToggle, onVolumeChange],
  )

  const percent = Math.round(volume * 100)

  return (
    <View
      style={styles.control}
      onLayout={event => {
        widthRef.current = event.nativeEvent.layout.width
      }}
      {...responder.panHandlers}
    >
      <View
        style={[styles.fill, { width: `${percent}%` }]}
        pointerEvents="none"
      />
      <View style={styles.row} pointerEvents="none">
        <Text style={styles.label}>
          {isLooping ? '⏸ Stop loop' : '▶ Loop'}
        </Text>
        <Text style={styles.volume}>vol {percent}%</Text>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  control: {
    backgroundColor: THEME.surface,
    borderColor: THEME.border,
    borderWidth: 1,
    borderRadius: 14,
    overflow: 'hidden',
    justifyContent: 'center',
    minHeight: 64,
  },
  fill: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    backgroundColor: '#ede9fe', // violet-100, the volume level
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 20,
    paddingHorizontal: 20,
  },
  label: {
    fontFamily: FONT_MONO,
    fontSize: 20,
    fontWeight: '600',
    color: THEME.text,
  },
  volume: {
    fontFamily: FONT_MONO,
    fontSize: 14,
    color: THEME.textMuted,
  },
})

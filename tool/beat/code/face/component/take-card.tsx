/**
 * A take row in Review: play/stop, length, rating, share, and
 * delete. One card per take. The play control flips to stop
 * while this take is the one sounding.
 */

import { Pressable, StyleSheet, Text, View } from 'react-native'
import { Rating } from '@/base/types'
import type { Take } from '@/base/types'
import { formatClock } from '@/base/time'
import { THEME, FONT_MONO } from '@/face/theme'

/** The three rating choices and the glyph for each. */

const RATING_CHOICES: { rating: Rating; glyph: string }[] = [
  { rating: Rating.Down, glyph: '👎' },
  { rating: Rating.Up, glyph: '👍' },
  { rating: Rating.Star, glyph: '⭐' },
]

export type TakeCardProps = {
  take: Take
  /** Whether this take is the one currently playing. */
  isActive: boolean
  onPlay(): void
  onStop(): void
  onShare(): void
  onDelete(): void
  onRate(rating: Rating): void
}

export default function TakeCard({
  take,
  isActive,
  onPlay,
  onStop,
  onShare,
  onDelete,
  onRate,
}: TakeCardProps) {
  const hasAudio = Boolean(take.recordingUri)

  return (
    <View style={styles.card}>
      <View style={styles.top}>
        <Pressable
          onPress={isActive ? onStop : onPlay}
          disabled={!hasAudio}
          style={[styles.play, !hasAudio && styles.playOff]}
        >
          <Text style={styles.playGlyph}>{isActive ? '■' : '▶'}</Text>
        </Pressable>
        <Text style={styles.label}>Take {take.createdAt}</Text>
        {take.durationMs ? (
          <Text style={styles.duration}>{formatClock(take.durationMs)}</Text>
        ) : null}
        <View style={styles.spacer} />
        <Pressable
          onPress={onShare}
          disabled={!hasAudio}
          style={styles.action}
        >
          <Text style={styles.actionGlyph}>⤴</Text>
        </Pressable>
        <Pressable onPress={onDelete} style={styles.action}>
          <Text style={[styles.actionGlyph, styles.delete]}>✕</Text>
        </Pressable>
      </View>

      <View style={styles.ratings}>
        {RATING_CHOICES.map(choice => {
          const active = take.rating === choice.rating
          return (
            <Pressable
              key={choice.rating}
              onPress={() => onRate(choice.rating)}
              style={[styles.rating, active && styles.ratingActive]}
            >
              <Text style={styles.ratingGlyph}>{choice.glyph}</Text>
            </Pressable>
          )
        })}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: THEME.surface,
    borderColor: THEME.border,
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    gap: 10,
  },
  top: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  play: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: THEME.primary,
  },
  playOff: {
    backgroundColor: THEME.border,
  },
  playGlyph: {
    fontSize: 14,
    color: '#ffffff',
  },
  label: {
    fontFamily: FONT_MONO,
    fontSize: 16,
    color: THEME.text,
  },
  duration: {
    fontFamily: FONT_MONO,
    fontSize: 13,
    color: THEME.textMuted,
  },
  spacer: {
    flex: 1,
  },
  action: {
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  actionGlyph: {
    fontFamily: FONT_MONO,
    fontSize: 18,
    color: THEME.textMuted,
  },
  delete: {
    color: THEME.down,
  },
  ratings: {
    flexDirection: 'row',
    gap: 8,
  },
  rating: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 8,
    opacity: 0.4,
  },
  ratingActive: {
    backgroundColor: THEME.background,
    opacity: 1,
  },
  ratingGlyph: {
    fontSize: 22,
  },
})

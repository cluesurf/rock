/**
 * Review screen. Where decisions happen, not while driving.
 * Lists takes grouped by section with thumbs-up, thumbs-
 * down, and star controls. Tapping a rating updates the
 * take in the store. Sections with no takes are hidden.
 */

import { Pressable, StyleSheet, Text, View } from 'react-native'
import { useLocalSearchParams } from 'expo-router'
import { useBeatStore, orderSections, takesForSection } from '@/face/store'
import { useTakePlayer } from '@/face/hook/use-take-player'
import { Rating } from '@/base/types'
import { formatClock } from '@/base/time'
import { THEME, FONT_MONO } from '@/face/theme'
import Screen from '@/face/component/screen'

/** The three rating choices and the glyph for each. */

const RATING_CHOICES: { rating: Rating; glyph: string; color: string }[] = [
  { rating: Rating.Down, glyph: '👎', color: THEME.down },
  { rating: Rating.Up, glyph: '👍', color: THEME.up },
  { rating: Rating.Star, glyph: '⭐', color: THEME.star },
]

export default function ReviewScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const song = useBeatStore(state => state.songs[id])
  const sectionMap = useBeatStore(state => state.sections)
  const takes = useBeatStore(state => state.takes)
  const rateTake = useBeatStore(state => state.rateTake)
  const player = useTakePlayer()

  if (!song) {
    return <Screen title="Not found" />
  }

  const sections = orderSections({ song, sections: sectionMap })

  return (
    <Screen title={song.name} subtitle="review takes">
      {sections.map(section => {
        const sectionTakes = takesForSection({ takes, sectionId: section.id })

        if (sectionTakes.length === 0) {
          return null
        }

        return (
          <View key={section.id} style={styles.group}>
            <Text style={styles.groupTitle}>{section.name}</Text>
            {sectionTakes.map(take => (
              <View key={take.id} style={styles.takeRow}>
                <View style={styles.takeInfo}>
                  <Pressable
                    onPress={() =>
                      take.recordingUri && player.play(take.recordingUri)
                    }
                    disabled={!take.recordingUri}
                    style={[styles.play, !take.recordingUri && styles.playOff]}
                  >
                    <Text style={styles.playGlyph}>▶</Text>
                  </Pressable>
                  <Text style={styles.takeLabel}>Take {take.createdAt}</Text>
                  {take.durationMs ? (
                    <Text style={styles.takeDuration}>
                      {formatClock(take.durationMs)}
                    </Text>
                  ) : null}
                </View>
                <View style={styles.ratings}>
                  {RATING_CHOICES.map(choice => {
                    const active = take.rating === choice.rating
                    return (
                      <Pressable
                        key={choice.rating}
                        onPress={() =>
                          rateTake({ takeId: take.id, rating: choice.rating })
                        }
                        style={[styles.rating, active && styles.ratingActive]}
                      >
                        <Text style={styles.ratingGlyph}>{choice.glyph}</Text>
                      </Pressable>
                    )
                  })}
                </View>
              </View>
            ))}
          </View>
        )
      })}
    </Screen>
  )
}

const styles = StyleSheet.create({
  group: {
    gap: 8,
  },
  groupTitle: {
    fontFamily: FONT_MONO,
    fontSize: 16,
    fontWeight: '700',
    color: THEME.text,
    marginTop: 8,
  },
  takeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: THEME.surface,
    borderColor: THEME.border,
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  takeInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  play: {
    width: 32,
    height: 32,
    borderRadius: 16,
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
    marginLeft: 2,
  },
  takeLabel: {
    fontFamily: FONT_MONO,
    fontSize: 16,
    color: THEME.text,
  },
  takeDuration: {
    fontFamily: FONT_MONO,
    fontSize: 13,
    color: THEME.textMuted,
  },
  ratings: {
    flexDirection: 'row',
    gap: 8,
  },
  rating: {
    paddingVertical: 6,
    paddingHorizontal: 8,
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

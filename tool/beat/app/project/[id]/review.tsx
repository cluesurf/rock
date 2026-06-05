/**
 * Review screen. Where decisions happen, not while driving.
 *
 * Takes are grouped by section. Filter to all, liked, or
 * starred. Per take: play/stop, rate, share off the phone
 * (expo-sharing), or delete. Per section: Compare, which plays
 * that section's takes back-to-back so the winner is obvious.
 */

import { useState } from 'react'
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native'
import { useLocalSearchParams } from 'expo-router'
import * as Sharing from 'expo-sharing'
import { useBeatStore, orderSections, takesForSection } from '@/face/store'
import { useTakePlayer } from '@/face/hook/use-take-player'
import { Rating } from '@/base/types'
import type { Take } from '@/base/types'
import { THEME, FONT_MONO } from '@/face/theme'
import Screen from '@/face/component/screen'
import TakeCard from '@/face/component/take-card'

/** The review filters. */

type Filter = 'all' | 'liked' | 'starred'

const FILTERS: { key: Filter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'liked', label: 'Liked' },
  { key: 'starred', label: 'Starred' },
]

/** Whether a take passes the active filter. */

function passesFilter(take: Take, filter: Filter): boolean {
  if (filter === 'liked') {
    return take.rating >= Rating.Up
  }
  if (filter === 'starred') {
    return take.rating === Rating.Star
  }
  return true
}

export default function ReviewScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const song = useBeatStore(state => state.songs[id])
  const sectionMap = useBeatStore(state => state.sections)
  const takes = useBeatStore(state => state.takes)
  const rateTake = useBeatStore(state => state.rateTake)
  const removeTake = useBeatStore(state => state.removeTake)
  const player = useTakePlayer()

  const [filter, setFilter] = useState<Filter>('all')

  if (!song) {
    return <Screen title="Not found" />
  }

  const sections = orderSections({ song, sections: sectionMap })

  const share = async (take: Take) => {
    if (!take.recordingUri) {
      return
    }
    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(take.recordingUri)
    }
  }

  const confirmDelete = (take: Take) => {
    Alert.alert('Delete take', `Delete take ${take.createdAt}?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          if (player.activeUri === take.recordingUri) {
            player.stop()
          }
          removeTake(take.id)
        },
      },
    ])
  }

  return (
    <Screen title={song.name} subtitle="review takes">
      <View style={styles.filters}>
        {FILTERS.map(option => {
          const active = filter === option.key
          return (
            <Pressable
              key={option.key}
              onPress={() => setFilter(option.key)}
              style={[styles.pill, active && styles.pillActive]}
            >
              <Text style={[styles.pillText, active && styles.pillTextActive]}>
                {option.label}
              </Text>
            </Pressable>
          )
        })}
      </View>

      {sections.map(section => {
        const sectionTakes = takesForSection({
          takes,
          sectionId: section.id,
        }).filter(take => passesFilter(take, filter))

        if (sectionTakes.length === 0) {
          return null
        }

        const playableUris = sectionTakes
          .map(take => take.recordingUri)
          .filter((uri): uri is string => Boolean(uri))

        return (
          <View key={section.id} style={styles.group}>
            <View style={styles.groupHeader}>
              <Text style={styles.groupTitle}>{section.name}</Text>
              {playableUris.length > 1 ? (
                <Pressable
                  onPress={() => player.playSequence(playableUris)}
                  style={styles.compare}
                >
                  <Text style={styles.compareText}>Compare</Text>
                </Pressable>
              ) : null}
            </View>

            {sectionTakes.map(take => (
              <TakeCard
                key={take.id}
                take={take}
                isActive={player.activeUri === take.recordingUri}
                onPlay={() => take.recordingUri && player.playOne(take.recordingUri)}
                onStop={() => player.stop()}
                onShare={() => share(take)}
                onDelete={() => confirmDelete(take)}
                onRate={rating => rateTake({ takeId: take.id, rating })}
              />
            ))}
          </View>
        )
      })}
    </Screen>
  )
}

const styles = StyleSheet.create({
  filters: {
    flexDirection: 'row',
    gap: 8,
  },
  pill: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 999,
    backgroundColor: THEME.surface,
    borderColor: THEME.border,
    borderWidth: 1,
  },
  pillActive: {
    backgroundColor: THEME.text,
    borderColor: THEME.text,
  },
  pillText: {
    fontFamily: FONT_MONO,
    fontSize: 14,
    color: THEME.text,
  },
  pillTextActive: {
    color: '#ffffff',
  },
  group: {
    gap: 8,
    marginTop: 8,
  },
  groupHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  groupTitle: {
    fontFamily: FONT_MONO,
    fontSize: 16,
    fontWeight: '700',
    color: THEME.text,
  },
  compare: {
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderRadius: 999,
    backgroundColor: THEME.primary,
  },
  compareText: {
    fontFamily: FONT_MONO,
    fontSize: 13,
    fontWeight: '600',
    color: '#ffffff',
  },
})

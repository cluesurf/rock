/**
 * Project screen. A song's sections as big tap targets that
 * double as a loop builder.
 *
 * Tap one or more sections to select them (they highlight).
 * The selected sections play back-to-back in a loop with
 * "Loop", so fine-grained markers can be combined into an
 * arbitrary looped sequence. "Record" opens the recorder for
 * the selection, looping it while you record an idea over it.
 *
 * Section-first navigation: no scrubbing, no waveform.
 */

import { useState } from 'react'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useBeatStore, orderSections } from '@/face/store'
import { useLoopPlayer } from '@/face/hook/use-loop-player'
import { buildLoopSegments } from '@/base/loop'
import Screen from '@/face/component/screen'
import TapButton from '@/face/component/tap-button'

export default function ProjectScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const router = useRouter()
  const song = useBeatStore(state => state.songs[id])
  const sectionMap = useBeatStore(state => state.sections)
  const takes = useBeatStore(state => state.takes)
  const sections = orderSections({ song, sections: sectionMap })
  const loop = useLoopPlayer(song?.audioUri)

  // Selected section ids, in tap order. Looping plays them in
  // time order via buildLoopSegments.
  const [selected, setSelected] = useState<string[]>([])

  if (!song) {
    return <Screen title="Not found" />
  }

  const toggle = (sectionId: string) => {
    setSelected(previous =>
      previous.includes(sectionId)
        ? previous.filter(item => item !== sectionId)
        : [...previous, sectionId],
    )
  }

  const segments = buildLoopSegments({ sections, selectedIds: selected })

  const onLoop = () => {
    if (loop.isLooping) {
      loop.stop()
    } else {
      loop.start(segments)
    }
  }

  const onRecord = () => {
    loop.stop()
    router.push(`/project/${song.id}/record?sections=${selected.join(',')}`)
  }

  const takeCountFor = (sectionId: string) =>
    Object.values(takes).filter(take => take.sectionId === sectionId).length

  const partWord = selected.length === 1 ? 'part' : 'parts'

  return (
    <Screen
      title={song.name}
      subtitle={
        loop.hasAudio ? 'tap parts to loop or record over' : 'tap a part to record'
      }
    >
      {sections.map(section => {
        const count = takeCountFor(section.id)
        return (
          <TapButton
            key={section.id}
            label={section.name}
            detail={count > 0 ? `${count} takes` : undefined}
            selected={selected.includes(section.id)}
            onPress={() => toggle(section.id)}
          />
        )
      })}

      {loop.hasAudio ? (
        <TapButton
          label={
            loop.isLooping
              ? '⏸ Stop loop'
              : selected.length === 0
                ? '▶ Loop'
                : `▶ Loop ${selected.length} ${partWord}`
          }
          disabled={selected.length === 0}
          onPress={onLoop}
        />
      ) : null}

      <TapButton
        label={
          selected.length > 1 ? `Record over ${selected.length} parts` : 'Record'
        }
        variant="primary"
        disabled={selected.length === 0}
        onPress={onRecord}
      />

      <TapButton
        label="Review takes"
        onPress={() => router.push(`/project/${song.id}/review`)}
      />
    </Screen>
  )
}

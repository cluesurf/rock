/**
 * Shared screen shell. Provides the safe-area padding, the
 * monochrome background, and the all-caps page title used
 * across every screen, so the four routes stay visually
 * consistent without repeating layout code.
 */

import type { ReactNode } from 'react'
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import { THEME, FONT_MONO } from '@/face/theme'

export type ScreenProps = {
  /** Big all-caps page header. */
  title: string
  /** Optional thin subtitle under the header. */
  subtitle?: string
  /** Body content. Optional so empty/not-found states render. */
  children?: ReactNode
}

export default function Screen({ title, subtitle, children }: ScreenProps) {
  const insets = useSafeAreaInsets()
  const router = useRouter()
  // Show a back control on any screen that has somewhere to
  // return to. The home (Projects) screen has nothing behind
  // it, so it shows none. Swipe-back is also enabled globally
  // in the root layout, but the explicit button keeps users
  // from getting stuck.
  const canGoBack = router.canGoBack()

  return (
    <View
      style={[
        styles.root,
        { paddingTop: insets.top + 12, paddingBottom: insets.bottom },
      ]}
    >
      {canGoBack ? (
        <Pressable
          onPress={() => router.back()}
          hitSlop={16}
          style={({ pressed }) => [styles.back, pressed && styles.backPressed]}
        >
          <Text style={styles.backText}>‹ Back</Text>
        </Pressable>
      ) : null}
      <Text style={styles.title}>{title.toUpperCase()}</Text>
      {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
      >
        {children}
      </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: THEME.background,
    paddingHorizontal: 20,
  },
  back: {
    alignSelf: 'flex-start',
    paddingVertical: 8,
    paddingRight: 16,
    marginBottom: 4,
  },
  backPressed: {
    opacity: 0.5,
  },
  backText: {
    fontFamily: FONT_MONO,
    fontSize: 17,
    fontWeight: '600',
    color: THEME.primary,
  },
  title: {
    fontFamily: FONT_MONO,
    fontSize: 28,
    fontWeight: '700',
    letterSpacing: 1,
    color: THEME.text,
  },
  subtitle: {
    fontFamily: FONT_MONO,
    fontSize: 13,
    color: THEME.textMuted,
    marginTop: 4,
  },
  scroll: {
    flex: 1,
    marginTop: 20,
  },
  content: {
    paddingBottom: 32,
    gap: 12,
  },
})

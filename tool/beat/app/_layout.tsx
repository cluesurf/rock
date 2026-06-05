/**
 * Root layout. Wraps the whole app in the safe-area
 * provider and a headerless native stack. Each screen
 * draws its own title through the shared Screen shell, so
 * the platform header stays hidden for the clean
 * field-notebook look.
 *
 * We seed SafeAreaProvider with `initialWindowMetrics` so it
 * renders synchronously on mount. Without it, SafeAreaProvider
 * renders null until it has async-measured the insets, which
 * shows up as a blank white screen with no error on launch.
 */

import { useEffect } from 'react'
import { Stack } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import { setAudioModeAsync } from 'expo-audio'
import {
  SafeAreaProvider,
  initialWindowMetrics,
} from 'react-native-safe-area-context'
import { useBeatStore } from '@/face/store'

export default function RootLayout() {
  // Load persisted songs and takes once on launch. Runs after
  // first render; the empty state shows until a saved document
  // (if any) loads. Guarded inside the store so a read failure
  // never crashes the app.
  const hydrate = useBeatStore(state => state.hydrate)
  useEffect(() => {
    hydrate()
  }, [hydrate])

  // Configure the audio session up front so base-track playback
  // is audible even with the hardware silent switch on, and
  // routes to the loud bottom speaker rather than the quiet
  // earpiece. Without this, the loop played silently until
  // recording configured the session, and then came out the
  // earpiece at low volume.
  useEffect(() => {
    setAudioModeAsync({
      playsInSilentMode: true,
      shouldRouteThroughEarpiece: false,
    }).catch(() => {})
  }, [])

  return (
    <SafeAreaProvider initialMetrics={initialWindowMetrics}>
      <StatusBar style="auto" />
      <Stack
        screenOptions={{
          headerShown: false,
          // Swipe from anywhere left-to-right to go back, not
          // just the screen edge. Paired with the explicit Back
          // button in the Screen shell so navigation is never a
          // dead end.
          gestureEnabled: true,
          fullScreenGestureEnabled: true,
          animation: 'slide_from_right',
        }}
      />
    </SafeAreaProvider>
  )
}

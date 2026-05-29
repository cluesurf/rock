/**
 * The big tap target used for songs, sections, and primary
 * actions. Driving-friendly: large hit area, high
 * contrast, no precision needed. Variants pick the accent.
 */

import { Pressable, StyleSheet, Text, View } from 'react-native'
import { THEME, FONT_MONO } from '@/face/theme'

/** Visual emphasis of the button. */

export type TapVariant = 'base' | 'primary'

export type TapButtonProps = {
  label: string
  /** Optional secondary line, e.g. a take count or time. */
  detail?: string
  variant?: TapVariant
  /** When true, draws a selected (loop-included) highlight. */
  selected?: boolean
  /** When true, dims and ignores presses. */
  disabled?: boolean
  onPress: () => void
}

export default function TapButton({
  label,
  detail,
  variant = 'base',
  selected = false,
  disabled = false,
  onPress,
}: TapButtonProps) {
  const isPrimary = variant === 'primary'

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.button,
        isPrimary && styles.primary,
        selected && styles.selected,
        pressed && styles.pressed,
        disabled && styles.disabled,
      ]}
    >
      <View style={styles.row}>
        <Text style={[styles.label, isPrimary && styles.primaryLabel]}>
          {label}
        </Text>
        {detail ? (
          <Text style={[styles.detail, isPrimary && styles.primaryLabel]}>
            {detail}
          </Text>
        ) : null}
      </View>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  button: {
    backgroundColor: THEME.surface,
    borderColor: THEME.border,
    borderWidth: 1,
    borderRadius: 14,
    paddingVertical: 22,
    paddingHorizontal: 20,
  },
  primary: {
    backgroundColor: THEME.primary,
    borderColor: THEME.primary,
  },
  selected: {
    borderColor: THEME.primary,
    borderWidth: 2,
    backgroundColor: '#f5f3ff', // violet-50, a faint selected tint
  },
  pressed: {
    opacity: 0.7,
  },
  disabled: {
    opacity: 0.4,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  label: {
    fontFamily: FONT_MONO,
    fontSize: 20,
    fontWeight: '600',
    color: THEME.text,
  },
  primaryLabel: {
    color: '#ffffff',
  },
  detail: {
    fontFamily: FONT_MONO,
    fontSize: 14,
    color: THEME.textMuted,
  },
})

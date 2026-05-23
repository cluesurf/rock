/**
 * Theme shape. Lives in the base layer (no React deps) so
 * individual theme files can be imported standalone without
 * pulling in the face / xterm runtime.
 *
 *     import { dracula } from '@cluesurf/rock/theme/dracula'
 *     <Slab theme={dracula}>
 */
export type RockTheme = {
  /** Display name. Shown in palette / settings UI. */
  name?: string
  /** Base colors. */
  background?: string
  foreground?: string
  cursor?: string
  cursorAccent?: string
  selectionBackground?: string
  selectionForeground?: string
  cursorStyle?: 'block' | 'underline' | 'bar'
  cursorBlink?: boolean
  /** Font + sizing. */
  font?: string
  fontSize?: number
  lineHeight?: number
  /** ANSI 16-color palette for shell colored output. */
  black?: string
  red?: string
  green?: string
  yellow?: string
  blue?: string
  magenta?: string
  cyan?: string
  white?: string
  brightBlack?: string
  brightRed?: string
  brightGreen?: string
  brightYellow?: string
  brightBlue?: string
  brightMagenta?: string
  brightCyan?: string
  brightWhite?: string
  /** UI accent (sidebar highlight, focus ring, etc.). */
  accent?: string
  palette?: Record<string, string> | string
}

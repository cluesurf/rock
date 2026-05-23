import type { RockTheme } from '@/base/theme'

/**
 * ClueSurf light theme — mirror of `cluesurfDark` with
 * inverted base palette. Same color families (rose/emerald/
 * violet/zinc/blue/yellow/cyan) but the ANSI slots use the
 * darker shades that read on a near-white background.
 *
 * Background is zinc-50 (#fafafa). Accent is violet-600.
 * Pair: `@cluesurf/rock/theme/cluesurf/dark`.
 */
export const cluesurfLight: RockTheme = {
  name: 'ClueSurf Light',
  font: '"Noto Sans Mono", ui-monospace, "SF Mono", Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
  background: '#fafafa', // zinc-50
  foreground: '#18181b', // zinc-900 — primary text
  cursor: '#7c3aed', // violet-600
  cursorAccent: '#fafafa',
  selectionBackground: '#e4e4e7', // zinc-200

  // ANSI 16-color palette — darker shades for contrast
  // against the near-white background.
  black: '#18181b', // zinc-900
  red: '#e11d48', // rose-600
  green: '#059669', // emerald-600
  yellow: '#ca8a04', // yellow-600 (less gold than -500, still readable)
  blue: '#2563eb', // blue-600
  magenta: '#7c3aed', // violet-600
  cyan: '#0891b2', // cyan-600
  white: '#52525b', // zinc-600 — "white" needs to be readable, not bright

  // Bright variants — slightly lighter (-500). Brighter
  // than the regular shade so they read as "bright" but
  // still contrast against the white bg.
  brightBlack: '#71717a', // zinc-500 — muted gray (same as dark for parity)
  brightRed: '#f43f5e', // rose-500
  brightGreen: '#10b981', // emerald-500
  brightYellow: '#eab308', // yellow-500
  brightBlue: '#3b82f6', // blue-500
  brightMagenta: '#8b5cf6', // violet-500
  brightCyan: '#06b6d4', // cyan-500
  brightWhite: '#27272a', // zinc-800 — strongest "white" = dark gray on light bg

  accent: '#7c3aed', // violet-600 — matches magenta for cohesion
}

export default cluesurfLight

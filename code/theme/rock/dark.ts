import type { RockTheme } from '@/base/theme'

/**
 * Rock dark theme. Built on Tailwind's palette:
 *   greens  → emerald
 *   reds    → rose
 *   purples → violet
 *   grays   → zinc
 *   blue, yellow, cyan → standard Tailwind
 *
 * Background is zinc-950 (#09090b). Accent is violet-400.
 * Pair: `@cluesurf/rock/theme/rock/light`.
 */
export const rockDark: RockTheme = {
  name: 'Rock Dark',
  font: '"Noto Sans Mono", ui-monospace, "SF Mono", Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
  background: '#09090b', // zinc-950
  // Foreground — sits between zinc-400 (#a1a1aa) and
  // zinc-300 (#d4d4d8), roughly the halfway point.
  // zinc-400 read "still too gray", zinc-300 read
  // "too white"; this is the comfortable middle.
  foreground: '#b3b6bc', // ~zinc-350
  cursor: '#a78bfa', // violet-400 — accent stays bright; it's a focus signal
  cursorAccent: '#09090b',
  selectionBackground: '#3f3f46', // zinc-700

  // ANSI 16-color palette — pulled DOWN one Tailwind tier
  // from the usual 500/400 split. Bare colors are 600 so
  // they don't glow against zinc-950; brights are the
  // formerly-default 500 shade.
  black: '#27272a', // zinc-800 — visible against zinc-950 bg
  red: '#e11d48', // rose-600
  green: '#059669', // emerald-600
  yellow: '#ca8a04', // yellow-600
  blue: '#2563eb', // blue-600
  magenta: '#7c3aed', // violet-600
  cyan: '#0891b2', // cyan-600
  white: '#b3b6bc', // matches foreground

  brightBlack: '#52525b', // zinc-600 — readable muted gray
  brightRed: '#f43f5e', // rose-500
  brightGreen: '#10b981', // emerald-500
  brightYellow: '#eab308', // yellow-500
  brightBlue: '#3b82f6', // blue-500
  brightMagenta: '#8b5cf6', // violet-500
  brightCyan: '#06b6d4', // cyan-500
  brightWhite: '#d4d4d8', // zinc-300 — was zinc-200; "bright white" is now soft body weight

  accent: '#a78bfa', // violet-400 — matches magenta for cohesion
}

export default rockDark

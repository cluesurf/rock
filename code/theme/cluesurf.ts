import type { RockTheme } from '@/base/theme'

/**
 * ClueSurf house theme. Built on Tailwind's palette:
 *   greens  → emerald
 *   reds    → rose
 *   purples → violet
 *   grays   → zinc
 *   blue, yellow, cyan → standard Tailwind
 *
 * Background is zinc-950 (#09090b). Accent is violet-500.
 */
export const cluesurf: RockTheme = {
  name: 'ClueSurf',
  font: '"Noto Sans Mono", ui-monospace, "SF Mono", Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
  background: '#09090b', // zinc-950
  foreground: '#e4e4e7', // zinc-200
  cursor: '#a78bfa', // violet-400
  cursorAccent: '#09090b',
  selectionBackground: '#3f3f46', // zinc-700 (was zinc-800 — bumped for more contrast on selection)

  // ANSI 16-color palette
  black: '#27272a', // zinc-800 — visible against zinc-950 bg (was zinc-900, near-invisible)
  red: '#f43f5e', // rose-500
  green: '#10b981', // emerald-500
  yellow: '#facc15', // yellow-400 — brighter than yellow-500 (less gold)
  blue: '#60a5fa', // blue-400 — brighter than blue-500
  magenta: '#a78bfa', // violet-400 — brighter than violet-500
  cyan: '#06b6d4', // cyan-500
  white: '#e4e4e7', // zinc-200

  brightBlack: '#71717a', // zinc-500 — readable muted gray (was zinc-700, too dark)
  brightRed: '#fb7185', // rose-400
  brightGreen: '#34d399', // emerald-400
  brightYellow: '#fde047', // yellow-300
  brightBlue: '#93c5fd', // blue-300
  brightMagenta: '#c4b5fd', // violet-300
  brightCyan: '#22d3ee', // cyan-400
  brightWhite: '#f4f4f5', // zinc-100

  accent: '#a78bfa', // violet-400 — matches magenta for cohesion
}

export default cluesurf

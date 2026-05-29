/**
 * Monochrome brand tokens for the hello-world build.
 *
 * The brand is monospaced black-and-white pen-and-ink:
 * meditative, field-notebook, not a SaaS dashboard. Color
 * appears only where the UI earns it. For the boilerplate
 * we keep one light surface and reserve violet for the
 * primary action and emerald/rose for ratings.
 *
 * These are plain values, not a styling framework. When
 * nativewind lands (see implementation/theme.md) these map
 * onto the six-family Tailwind palette.
 */

export const THEME = {
  background: '#fafafa', // zinc-50
  surface: '#f4f4f5', // zinc-100
  border: '#e4e4e7', // zinc-200
  text: '#18181b', // zinc-900
  textMuted: '#71717a', // zinc-500
  primary: '#7c3aed', // violet-600, the one accent
  up: '#059669', // emerald-600
  down: '#e11d48', // rose-600
  star: '#ca8a04', // yellow-600
} as const

/**
 * One monospace stack. CrowMark is the brand face once the
 * font asset is wired in. Until then fall back to the
 * platform monospace so the look holds.
 */

export const FONT_MONO =
  'ui-monospace, "SF Mono", Menlo, Monaco, "Courier New", monospace'

import type { SearchAddon } from '@xterm/addon-search'

/**
 * Module-level registry of xterm SearchAddon instances
 * keyed by slabId. Each Dock registers its addon on mount
 * (so the global Find widget can call findNext / findPrevious
 * against whichever terminal is currently active) and
 * unregisters on unmount.
 *
 * The map is intentionally NOT in the Zustand store: addons
 * are opaque imperative objects (no reactive consumers
 * need to re-render when the addon identity changes), and
 * keeping them out of the store avoids serialization churn.
 *
 * Consumers should read the addon via getSearchAddonForSlab
 * at the moment they need it, not capture it in state — the
 * active slab can change between renders.
 */

const registry = new Map<string, SearchAddon>()

export function registerSearchAddon(
  slabId: string,
  addon: SearchAddon,
): void {
  registry.set(slabId, addon)
}

export function unregisterSearchAddon(slabId: string): void {
  registry.delete(slabId)
}

export function getSearchAddonForSlab(
  slabId: string | undefined,
): SearchAddon | null {
  if (!slabId) return null
  return registry.get(slabId) ?? null
}

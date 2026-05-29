/**
 * Prefixed id generation.
 *
 * React Native's Hermes engine has no global `crypto`, so
 * this avoids `crypto.randomUUID` and uses a process-local
 * counter plus a random suffix. That is plenty for local
 * ids. When sync lands and ids must be globally unique
 * across devices, swap this for `expo-crypto` UUIDs without
 * changing call sites.
 *
 * Ids look like `song_3f9a2b` so they are self-describing
 * in logs and the data tables.
 */

let COUNTER = 0

export function createId(prefix: string): string {
  COUNTER += 1
  const random = Math.random().toString(36).slice(2, 8)
  return `${prefix}_${COUNTER.toString(36)}${random}`
}

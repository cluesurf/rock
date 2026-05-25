/**
 * Universally-available random UUID. Uses the Web Crypto
 * API (available in modern browsers AND in Node 19+) so
 * this module works in both renderer and main contexts.
 * Avoid `node:crypto` here — Vite externalizes it and the
 * import warns at bundle time.
 */
export function createId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID().replaceAll('-', '')}`
}

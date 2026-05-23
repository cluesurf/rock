/**
 * Custom `rock://` protocol for serving JIT-bundled user
 * code to the renderer.
 *
 * URL shape:
 *   rock://user/layout.js   the compiled `.rock/layout.tsx`
 *   rock://user/sidebar.js  the compiled `.rock/sidebar.tsx`
 *   rock://user/<key>.js    any other JIT bundle stored by key
 *
 * The compiled JS uses `globalThis.__rock__` for shared
 * modules (react, @cluesurf/rock/face, etc.) — see
 * `code/node/layout-bundle.ts` and
 * `code/face/external-bridge.ts`.
 *
 * Must be called BEFORE `app.whenReady()`:
 *
 *     registerRockProtocolSchemes()
 *     await app.whenReady()
 *     registerRockProtocol(bundles)
 */

import { protocol, net } from 'electron'

export function registerRockProtocolSchemes(): void {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: 'rock',
      privileges: {
        standard: true,
        secure: true,
        supportFetchAPI: true,
        allowServiceWorkers: false,
        bypassCSP: false,
      },
    },
  ])
}

export class RockBundleStore {
  private store = new Map<string, string>()

  set(key: string, code: string): void {
    this.store.set(key, code)
  }

  get(key: string): string | undefined {
    return this.store.get(key)
  }

  has(key: string): boolean {
    return this.store.has(key)
  }

  keys(): string[] {
    return [...this.store.keys()]
  }

  delete(key: string): boolean {
    return this.store.delete(key)
  }

  clear(): void {
    this.store.clear()
  }
}

/**
 * Register the `rock://` protocol handler. Call AFTER
 * `app.whenReady()`.
 */
export function registerRockProtocol(bundles: RockBundleStore): void {
  protocol.handle('rock', request => {
    const url = new URL(request.url)
    if (url.hostname === 'user') {
      const key = url.pathname.replace(/^\//, '')
      const code = bundles.get(key)
      if (!code) {
        return new Response(`// rock: no bundle for '${key}'`, {
          status: 404,
          headers: { 'content-type': 'application/javascript' },
        })
      }
      return new Response(code, {
        status: 200,
        headers: {
          'content-type': 'application/javascript',
          // No-cache so HMR-style re-bundles are visible
          // on next dynamic import.
          'cache-control': 'no-store',
        },
      })
    }
    return new Response('not found', { status: 404 })
  })
  // Reference net to avoid unused-import lint; not used in
  // this minimal handler but the surface may grow.
  void net
}

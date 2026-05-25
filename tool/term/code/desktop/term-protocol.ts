/**
 * Custom `term://` protocol for serving JIT-bundled user
 * code to the renderer.
 *
 * URL shape:
 *   term://user/layout.js   the compiled `.tool/term/layout.tsx`
 *   term://user/sidebar.js  the compiled `.tool/term/sidebar.tsx`
 *   term://user/<key>.js    any other JIT bundle stored by key
 *
 * The compiled JS uses `globalThis.__term__` for shared
 * modules (react, @cluesurf/term/face, etc.) — see
 * `code/node/layout-bundle.ts` and
 * `code/face/external-bridge.ts`.
 *
 * Must be called BEFORE `app.whenReady()`:
 *
 *     registerTermProtocolSchemes()
 *     await app.whenReady()
 *     registerTermProtocol(bundles)
 */

import { protocol, net } from 'electron'

export function registerTermProtocolSchemes(): void {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: 'term',
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

export class TermBundleStore {
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
 * Register the `term://` protocol handler. Call AFTER
 * `app.whenReady()`.
 */
export function registerTermProtocol(bundles: TermBundleStore): void {
  protocol.handle('term', request => {
    const url = new URL(request.url)
    if (url.hostname === 'user') {
      const key = url.pathname.replace(/^\//, '')
      const code = bundles.get(key)
      if (!code) {
        return new Response(`// term: no bundle for '${key}'`, {
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

/**
 * Renderer-side: expose React + the rock face surface on
 * `globalThis.__rock__` so JIT-bundled user code can
 * reference them without re-bundling React (React breaks
 * if loaded twice).
 *
 * The list of modules here MUST match the list in
 * `code/node/layout-bundle.ts` (which generates the
 * shim modules).
 *
 * Call this once, before mounting the app:
 *
 *     installExternalBridge()
 *     mount(<App />)
 *
 * `mount` calls it for you.
 */

import * as React from 'react'
import * as ReactJsxRuntime from 'react/jsx-runtime'
import * as ReactDom from 'react-dom'
import * as ReactDomClient from 'react-dom/client'
import * as Face from './index'

let installed = false

export function installExternalBridge(): void {
  if (installed) return
  installed = true

  const bridge: Record<string, unknown> = {
    react: React,
    'react/jsx-runtime': ReactJsxRuntime,
    'react-dom': ReactDom,
    'react-dom/client': ReactDomClient,
    '@cluesurf/rock/face': Face,
  }

  ;(globalThis as { __rock__?: Record<string, unknown> }).__rock__ =
    bridge
}

/**
 * Allow consumers to add their own modules into the bridge
 * (extra UI libraries, theme objects, anything else a
 * user `.rock/layout.tsx` might want to import). Keys must
 * match what `code/node/layout-bundle.ts` treats as
 * shared — extend `SHARED_MODULES` + `SHARED_EXPORTS`
 * there in tandem.
 */
export function extendExternalBridge(
  modules: Record<string, unknown>,
): void {
  const bridge =
    (globalThis as { __rock__?: Record<string, unknown> }).__rock__ ??
    {}
  Object.assign(bridge, modules)
  ;(globalThis as { __rock__?: Record<string, unknown> }).__rock__ =
    bridge
}

/**
 * Dynamically load a JIT-bundled user module served by
 * the rock:// protocol. Returns the DEFAULT export.
 *
 *     const exported = await loadUserModule<{ Layout?: ... }>('app.js')
 *
 * Throws if the bundle is missing.
 */
export async function loadUserModule<T = unknown>(
  bundleKey: string,
): Promise<T> {
  const url = `rock://user/${bundleKey}`
  const mod = (await import(/* @vite-ignore */ url)) as {
    default?: T
  }
  if (mod.default === undefined) {
    throw new Error(
      `rock://user/${bundleKey} has no default export`,
    )
  }
  return mod.default
}

/**
 * Load a JIT-bundled module and return the full namespace
 * (so callers can read multiple named exports).
 *
 *     const ns = await loadUserNamespace('app.js')
 *     const { Layout, Sidebar, commands } = ns
 */
export async function loadUserNamespace<T = unknown>(
  bundleKey: string,
): Promise<T> {
  const url = `rock://user/${bundleKey}`
  return (await import(/* @vite-ignore */ url)) as T
}

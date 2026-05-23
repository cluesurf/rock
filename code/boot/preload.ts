/**
 * One-import preload setup.
 *
 *     // boot/preload.ts
 *     import '@cluesurf/rock/boot/preload'
 *
 * Exposes `window.app` with the terminal API + slab-map
 * subscriber the renderer needs.
 */

import { contextBridge, ipcRenderer } from 'electron'
import {
  TERMINAL_EVENT_CHANNEL,
  TERMINAL_REQUEST_CHANNEL,
  type TerminalEvent,
  type TerminalRequest,
  type TerminalResponse,
} from '@/base/protocol'

const api = {
  terminal: {
    request(request: TerminalRequest): Promise<TerminalResponse> {
      return ipcRenderer.invoke(TERMINAL_REQUEST_CHANNEL, request)
    },
    onEvent(callback: (event: TerminalEvent) => void) {
      const listener = (
        _event: Electron.IpcRendererEvent,
        event: TerminalEvent,
      ) => callback(event)
      ipcRenderer.on(TERMINAL_EVENT_CHANNEL, listener)
      return () => {
        ipcRenderer.removeListener(TERMINAL_EVENT_CHANNEL, listener)
      }
    },
  },
  onSlabMap(callback: (map: Record<string, string>) => void) {
    const listener = (
      _event: Electron.IpcRendererEvent,
      map: Record<string, string>,
    ) => callback(map)
    ipcRenderer.on('rock:slab-map', listener)
    return () => ipcRenderer.removeListener('rock:slab-map', listener)
  },
  onFocus(callback: (slabId: string) => void) {
    const listener = (
      _event: Electron.IpcRendererEvent,
      payload: { slabId: string },
    ) => callback(payload.slabId)
    ipcRenderer.on('rock:focus', listener)
    return () => ipcRenderer.removeListener('rock:focus', listener)
  },
  // Pull the current slab map (avoids race with onSlabMap).
  async getSlabMap(): Promise<Record<string, string>> {
    return await ipcRenderer.invoke('rock:get-slab-map')
  },
  async getWorkspace(): Promise<unknown> {
    return await ipcRenderer.invoke('rock:get-workspace')
  },
  async newWindow(): Promise<void> {
    await ipcRenderer.invoke('rock:new-window')
  },
  // List of JIT user bundles available via the rock://
  // protocol. The renderer uses this to decide whether to
  // import a user layout/sidebar or fall back to defaults.
  async getUserBundles(): Promise<string[]> {
    return await ipcRenderer.invoke('rock:get-user-bundles')
  },
}

contextBridge.exposeInMainWorld('app', api)

export type RockWindowApi = typeof api

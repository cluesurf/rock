/**
 * One-import preload setup.
 *
 *     // boot/preload.ts
 *     import '@cluesurf/term/boot/preload'
 *
 * Exposes `window.app` with the terminal API + slab-map
 * subscriber the renderer needs.
 */

import { contextBridge, ipcRenderer, webUtils } from 'electron'
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
    ipcRenderer.on('term:slab-map', listener)
    return () => ipcRenderer.removeListener('term:slab-map', listener)
  },
  onFocus(callback: (slabId: string) => void) {
    const listener = (
      _event: Electron.IpcRendererEvent,
      payload: { slabId: string },
    ) => callback(payload.slabId)
    ipcRenderer.on('term:focus', listener)
    return () => ipcRenderer.removeListener('term:focus', listener)
  },
  // Pull the current slab map (avoids race with onSlabMap).
  async getSlabMap(): Promise<Record<string, string>> {
    return await ipcRenderer.invoke('term:get-slab-map')
  },
  async getWorkspace(): Promise<unknown> {
    return await ipcRenderer.invoke('term:get-workspace')
  },
  async newWindow(): Promise<void> {
    await ipcRenderer.invoke('term:new-window')
  },
  // List of JIT user bundles available via the term://
  // protocol. The renderer uses this to decide whether to
  // import a user layout/sidebar or fall back to defaults.
  async getUserBundles(): Promise<string[]> {
    return await ipcRenderer.invoke('term:get-user-bundles')
  },
  async newSlab(opts: {
    name?: string
    program?: string
    cwd?: string
    command?: string
  } = {}): Promise<{ name: string; id: string }> {
    return await ipcRenderer.invoke('term:new-slab', opts)
  },
  async openExternal(url: string): Promise<void> {
    return await ipcRenderer.invoke('term:open-external', url)
  },
  async openPath(filePath: string): Promise<string> {
    return await ipcRenderer.invoke('term:open-path', filePath)
  },
  async notifyCwd(slabId: string, cwd: string): Promise<void> {
    await ipcRenderer.invoke('term:cwd-change', { slabId, cwd })
  },
  async renameSlab(name: string, label: string): Promise<void> {
    await ipcRenderer.invoke('term:rename-slab', { name, label })
  },
  async getTree(): Promise<unknown> {
    return await ipcRenderer.invoke('term:get-tree')
  },
  async saveTree(tree: unknown): Promise<void> {
    await ipcRenderer.invoke('term:save-tree', tree)
  },
  // Cmd+, in the renderer calls this. Ensures .tool/term/ exists
  // at the launched cwd, flushes current state to
  // base.local.json, and opens the file in the user's
  // default editor.
  async openSettings(): Promise<void> {
    await ipcRenderer.invoke('term:open-settings')
  },
  async toggleFullscreen(): Promise<void> {
    await ipcRenderer.invoke('term:toggle-fullscreen')
  },
  // Electron 32+ removed the legacy `File.path` property
  // that older browsers / Electron versions exposed on
  // File objects originating from the filesystem. The
  // replacement is `webUtils.getPathForFile(file)`, which
  // can only be reached from a preload-bridged renderer.
  // Used by the dock's paste / drop handlers so pasting
  // a Finder-copied image (or dragging one in) inserts
  // its shell-escaped path into the terminal — matching
  // iTerm2's behavior, which Claude Code uses to pick
  // up attachments.
  getPathForFile(file: File): string {
    return webUtils.getPathForFile(file)
  },
}

contextBridge.exposeInMainWorld('app', api)

export type TermWindowApi = typeof api

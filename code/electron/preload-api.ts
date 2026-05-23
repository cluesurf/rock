import { contextBridge, ipcRenderer } from 'electron'
import {
  TERMINAL_EVENT_CHANNEL,
  TERMINAL_REQUEST_CHANNEL,
  type TerminalEvent,
  type TerminalRequest,
  type TerminalResponse,
} from '@/base/protocol'
import type { TerminalApi } from '@/react/terminal-api'

/**
 * Build the TerminalApi object that bridges the renderer
 * to the main process via Electron IPC.
 */
export function makeTerminalApi(): TerminalApi {
  return {
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
  }
}

/**
 * One-line preload setup. Exposes the API as
 * `window.app.terminal` in the renderer.
 *
 *     import { exposeTerminalApi } from '@cluesurf/rock/electron/preload-api'
 *     exposeTerminalApi()
 *
 * Use `makeTerminalApi()` directly if you want to attach
 * under a different name or compose with other bridges.
 */
export function exposeTerminalApi(key = 'app'): void {
  contextBridge.exposeInMainWorld(key, {
    terminal: makeTerminalApi(),
  })
}

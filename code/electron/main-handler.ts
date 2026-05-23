import { ipcMain, type BrowserWindow } from 'electron'
import {
  TERMINAL_EVENT_CHANNEL,
  TERMINAL_REQUEST_CHANNEL,
  type TerminalEvent,
  type TerminalRequest,
  type TerminalResponse,
} from '@/base/protocol'
import type { TerminalManager } from '@/node/terminal-manager'

export type WireTerminalMainInput = {
  manager: TerminalManager
}

/**
 * Wire the IPC request channel into a TerminalManager.
 *
 *     const manager = new TerminalManager({
 *       emit: (event) => win.webContents.send('terminal:event', event),
 *     })
 *     wireTerminalMain({ manager })
 */
export function wireTerminalMain(input: WireTerminalMainInput): void {
  ipcMain.handle(
    TERMINAL_REQUEST_CHANNEL,
    async (
      _event,
      request: TerminalRequest,
    ): Promise<TerminalResponse> => {
      try {
        const data = await input.manager.handle(request)
        return { ok: true, data }
      } catch (error) {
        return {
          ok: false,
          error: {
            code: 'terminal_error',
            message: error instanceof Error ? error.message : String(error),
          },
        }
      }
    },
  )
}

/**
 * Build the event emitter callback for a given BrowserWindow.
 * Pass the result as `emit` to the TerminalManager.
 */
export function createWindowEmitter(
  getWindow: () => BrowserWindow | null,
): (event: TerminalEvent) => void {
  return event => {
    getWindow()?.webContents.send(TERMINAL_EVENT_CHANNEL, event)
  }
}

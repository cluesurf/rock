import { contextBridge, ipcRenderer } from 'electron'
import { makeTerminalApi } from '@cluesurf/rock/desktop/preload-api'

const terminal = makeTerminalApi()

contextBridge.exposeInMainWorld('app', {
  terminal,
  onSlabMap(callback: (map: Record<string, string>) => void) {
    const listener = (
      _event: Electron.IpcRendererEvent,
      map: Record<string, string>,
    ) => callback(map)
    ipcRenderer.on('rock-demo:slab-map', listener)
    return () => ipcRenderer.removeListener('rock-demo:slab-map', listener)
  },
})

declare global {
  interface Window {
    app: {
      terminal: ReturnType<typeof makeTerminalApi>
      onSlabMap(callback: (map: Record<string, string>) => void): () => void
    }
  }
}

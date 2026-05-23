import { app, BrowserWindow } from 'electron'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { TerminalManager } from '@cluesurf/rock/node/terminal-manager'
import {
  createWindowEmitter,
  wireTerminalMain,
} from '@cluesurf/rock/desktop/main-handler'
import { compileWorkspace } from '@cluesurf/rock/base/compile-workspace'
import { defineWorkspace } from '@cluesurf/rock/base/define'
import type { TerminalEvent } from '@cluesurf/rock/base/protocol'

// Sets the macOS menu bar name, Cmd+Tab label, dock entry,
// and About dialog title. Must run before app.whenReady().
app.setName('Rock')

const __dirname = path.dirname(fileURLToPath(import.meta.url))

let win: BrowserWindow | null = null

/**
 * The demo workspace. In a real app this would live in
 * `.rock/workspace.ts` and be loaded via `loadRockFolder()`.
 * Inlined here so the demo runs without a folder loader.
 */
const workspaceConfig = defineWorkspace({
  name: 'rock-demo',
  slabs: {
    shell: {
      command: process.env.SHELL ?? 'zsh',
    },
    monitor: {
      command: 'top -l 0 -s 2',
    },
    clock: {
      command: 'sh -c "while true; do date; sleep 1; done"',
    },
  },
})

const compiled = compileWorkspace(workspaceConfig)

const emit = createWindowEmitter(() => win)

const manager = new TerminalManager({ emit })

wireTerminalMain({ manager })

async function spawnAllSlabs() {
  for (const slab of compiled.slabs) {
    await manager.createSlab({
      workspaceId: slab.workspaceId,
      tabId: slab.tabId,
      name: slab.name,
      cwd: slab.cwd,
      shell: slab.shell || undefined,
      command: slab.command,
      env: slab.env,
      cols: slab.cols,
      rows: slab.rows,
    })
  }
}

function createWindow() {
  win = new BrowserWindow({
    width: 1400,
    height: 900,
    title: 'Rock',
    titleBarStyle: 'hiddenInset',
    backgroundColor: '#0b0d10',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload', 'preload.mjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  })

  // Auto-open DevTools in dev (preview / start). Comment out for
  // production-style use.
  win.webContents.openDevTools({ mode: 'detach' })

  if (process.env.ELECTRON_RENDERER_URL) {
    win.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    win.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'))
  }

  win.once('ready-to-show', () => {
    win?.show()
  })

  // Push the compiled workspace into the renderer so the
  // store knows about the slabs (and their symbolic-name → ID
  // mapping). Without this, <Slab name="shell" /> won't resolve.
  win.webContents.once('did-finish-load', async () => {
    await spawnAllSlabs()
    const event: TerminalEvent = {
      type: 'workspace:changed',
      payload: { workspace: compiled.workspace },
    }
    emit(event)
    // Send the paneIdByName mapping so the renderer can resolve
    // symbolic names. We piggyback on the event channel via a
    // synthetic workspace event the React store can read from.
    win?.webContents.send('rock-demo:slab-map', compiled.slabIdByName)
  })
}

app.whenReady().then(createWindow)

app.on('window-all-closed', async () => {
  // Kill all PTYs as soon as the window closes. Otherwise
  // they keep emitting data and try to send through a
  // destroyed webContents. On macOS the app stays alive
  // even with no windows; we let the user re-launch via
  // `activate` to spawn fresh slabs.
  await manager.shutdown()
  if (process.platform !== 'darwin') app.quit()
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow()
})

app.on('before-quit', async () => {
  await manager.shutdown()
})

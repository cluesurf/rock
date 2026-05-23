/**
 * The one-call main-process entry. Collapses ~50 lines of
 * Electron + manager + IPC boilerplate into:
 *
 *     import { boot } from '@cluesurf/rock/boot'
 *     import workspace from '../.rock/workspace'
 *
 *     boot({ name: 'My App', workspace })
 *
 * Hides electron, node-pty, IPC plumbing. Returns an
 * AppHandle for programmatic control.
 */

import {
  app,
  BrowserWindow,
  Menu,
  dialog,
  globalShortcut,
  ipcMain,
  type BrowserWindowConstructorOptions,
} from 'electron'
import path from 'node:path'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { compileWorkspace } from '@/base/compile-workspace'
import type { WorkspaceDefinition } from '@/base/define'
import type { Slab, Workspace } from '@/base/types'
import type { TerminalEvent } from '@/base/protocol'
import { TerminalManager } from '@/node/terminal-manager'
import {
  createWindowEmitter,
  wireTerminalMain,
} from '@/desktop/main-handler'

export interface BootInput {
  /** App name (shown in menu bar, dock, Cmd+Tab). */
  name: string
  /** Workspace from `workspace({...})` in `.rock/workspace.ts`. */
  workspace: WorkspaceDefinition
  /** Path to a PNG/ICNS icon (used for dock + window icon). */
  icon?: string
  /** Window options (a curated subset of Electron's BrowserWindow). */
  window?: BootWindowOptions
  /** DevTools mode (default 'auto' = open if NODE_ENV=development). */
  devtools?: 'auto' | 'always' | 'never'
  /**
   * Allow multiple windows. When true (default), Cmd+N
   * (or Ctrl+N) opens a new window with the same workspace.
   * Set false to lock to a single window.
   */
  multiWindow?: boolean
  /** Called when the window is ready and slabs are spawning. */
  onReady?: (app: AppHandle) => void | Promise<void>
  /** Called when the app is shutting down. */
  onClose?: (app: AppHandle) => void | Promise<void>
}

export interface BootWindowOptions {
  width?: number
  height?: number
  title?: string
  background?: string
  transparent?: boolean
  titleBarStyle?: 'default' | 'hidden' | 'hiddenInset'
  fullscreen?: boolean
  minWidth?: number
  minHeight?: number
}

export interface AppHandle {
  workspace: Workspace
  slabs: Slab[]
  /** Open a new window (a new Slab) for the same workspace. */
  newWindow(): BrowserWindow
  /** All currently-open windows. */
  windows(): BrowserWindow[]
  spawn(name: string, options?: SpawnOptions): Promise<void>
  kill(name: string): Promise<void>
  restart(name: string): Promise<void>
  send(name: string, data: string): void
  focus(name: string): void
  /** Show the currently-focused window. */
  show(): void
  /** Hide the currently-focused window. */
  hide(): void
  /** Close the currently-focused window. */
  close(): void
  minimize(): void
  maximize(): void
}

export interface SpawnOptions {
  command?: string
  cwd?: string
  args?: string[]
  env?: Record<string, string>
}

const BENIGN_PATTERNS = [
  /Object has been destroyed/,
  /Render frame was disposed/,
  /GPU process exited unexpectedly/,
  /Network service crashed/,
  /webFrameMain could be accessed/,
]

function isBenign(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error)
  return BENIGN_PATTERNS.some(p => p.test(message))
}

export async function boot(input: BootInput): Promise<AppHandle> {
  // Branding
  app.setName(input.name)
  process.title = input.name

  // Compile workspace
  const compiled = compileWorkspace(input.workspace)

  const wins = new Set<BrowserWindow>()
  let shuttingDown = false

  const allowMulti = input.multiWindow ?? true

  function activeWindow(): BrowserWindow | null {
    return (
      BrowserWindow.getFocusedWindow() ??
      [...wins].find(w => !w.isDestroyed()) ??
      null
    )
  }

  // Emit to whichever window is currently focused.
  // For per-window event routing, see future multi-slab work.
  const emit = createWindowEmitter(() =>
    shuttingDown ? null : activeWindow(),
  )
  const manager = new TerminalManager({ emit })
  wireTerminalMain({ manager })

  // Global error suppression for benign noise
  process.on('uncaughtException', error => {
    if (shuttingDown || isBenign(error)) return
    const win = activeWindow()
    if (win && !win.isDestroyed()) {
      dialog.showErrorBox(
        `${input.name} — error`,
        error instanceof Error
          ? error.stack ?? error.message
          : String(error),
      )
    }
  })

  process.on('unhandledRejection', reason => {
    if (shuttingDown || isBenign(reason)) return
    console.error(`[${input.name}] unhandled rejection:`, reason)
  })

  async function gracefulShutdown() {
    if (shuttingDown) return
    shuttingDown = true
    try {
      if (input.onClose) await input.onClose(handle)
    } catch {
      // swallow
    }
    try {
      await manager.shutdown()
    } catch {
      // swallow
    }
  }

  const handle: AppHandle = {
    workspace: compiled.workspace,
    slabs: compiled.slabs,

    newWindow() {
      return createWindow()
    },

    windows() {
      return [...wins].filter(w => !w.isDestroyed())
    },

    async spawn(name, options = {}) {
      const cfg = input.workspace.slabs[name]
      await manager.createSlab({
        workspaceId: compiled.workspace.id,
        tabId: compiled.workspace.tabs[0]!.id,
        name,
        cwd: options.cwd ?? cfg?.cwd,
        program: cfg?.program,
        args: options.args ?? cfg?.args,
        command: options.command ?? cfg?.command,
        env: { ...cfg?.env, ...options.env },
        cols: 80,
        rows: 24,
      })
    },

    async kill(name) {
      const id = compiled.slabIdByName[name]
      if (id) manager.kill(id)
    },

    async restart(name) {
      const id = compiled.slabIdByName[name]
      if (id) await manager.restart(id)
    },

    send(name, data) {
      const id = compiled.slabIdByName[name]
      if (id) manager.write(id, data)
    },

    focus(name) {
      const win = activeWindow()
      if (!win || win.isDestroyed()) return
      const id = compiled.slabIdByName[name]
      win.webContents.send('rock:focus', { slabId: id })
    },

    show() {
      activeWindow()?.show()
    },
    hide() {
      activeWindow()?.hide()
    },
    close() {
      activeWindow()?.close()
    },
    minimize() {
      activeWindow()?.minimize()
    },
    maximize() {
      activeWindow()?.maximize()
    },
  }

  function locateIcon(): string | undefined {
    if (input.icon && existsSync(input.icon)) return input.icon
    return undefined
  }

  function locateAsset(filename: string): string {
    // Resolve relative to the consumer's app path (the
    // directory containing the package.json that was
    // launched). electron-vite places main / preload / renderer
    // under <appPath>/out/ by default.
    return path.join(app.getAppPath(), 'out', filename)
  }

  let primarySpawnDone = false

  function createWindow(): BrowserWindow {
    const iconPath = locateIcon()
    const opts = input.window ?? {}

    const baseOptions: BrowserWindowConstructorOptions = {
      width: opts.width ?? 1400,
      height: opts.height ?? 900,
      title: opts.title ?? input.name,
      backgroundColor: opts.background ?? '#0b0d10',
      titleBarStyle: opts.titleBarStyle ?? 'hiddenInset',
      transparent: opts.transparent,
      fullscreen: opts.fullscreen,
      minWidth: opts.minWidth,
      minHeight: opts.minHeight,
      show: false,
      webPreferences: {
        preload: locateAsset('preload/preload.mjs'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: false,
      },
    }
    if (iconPath) baseOptions.icon = iconPath

    const win = new BrowserWindow(baseOptions)
    wins.add(win)

    if (process.platform === 'darwin' && iconPath && app.dock) {
      try {
        app.dock.setIcon(iconPath)
      } catch {
        /* ignore */
      }
    }

    if (process.env.ELECTRON_RENDERER_URL) {
      win.loadURL(process.env.ELECTRON_RENDERER_URL)
    } else {
      win.loadFile(locateAsset('renderer/index.html'))
    }

    const devtoolsMode = input.devtools ?? 'auto'
    const inDev =
      process.env.NODE_ENV === 'development' ||
      Boolean(process.env.ELECTRON_RENDERER_URL)
    if (
      devtoolsMode === 'always' ||
      (devtoolsMode === 'auto' && inDev)
    ) {
      win.webContents.openDevTools({ mode: 'detach' })
    }

    win.once('ready-to-show', () => win.show())
    win.on('closed', () => {
      wins.delete(win)
    })

    win.webContents.once('did-finish-load', async () => {
      if (shuttingDown) return
      // Spawn workspace slabs once, on the primary window.
      // Additional windows attach to the existing slabs.
      if (!primarySpawnDone) {
        primarySpawnDone = true
        for (const slab of compiled.slabs) {
          try {
            await manager.createSlab({
              workspaceId: slab.workspaceId,
              tabId: slab.tabId,
              name: slab.name,
              cwd: slab.cwd,
              program: slab.program || undefined,
              command: slab.command,
              env: slab.env,
              cols: slab.cols,
              rows: slab.rows,
            })
          } catch (error) {
            console.error(
              `[${input.name}] failed to spawn '${slab.name}':`,
              error,
            )
          }
        }
      }
      if (shuttingDown || win.isDestroyed()) return

      const event: TerminalEvent = {
        type: 'workspace:changed',
        payload: { workspace: compiled.workspace },
      }
      win.webContents.send('terminal:event', event)

      try {
        win.webContents.send('rock:slab-map', compiled.slabIdByName)
      } catch {
        /* ignore */
      }

      if (input.onReady && wins.size === 1) {
        try {
          await input.onReady(handle)
        } catch (e) {
          console.error(e)
        }
      }
    })

    return win
  }

  function buildMenu() {
    // Minimal app menu giving Cmd+N "New Window" + system defaults.
    const template: Electron.MenuItemConstructorOptions[] = [
      ...(process.platform === 'darwin'
        ? [{ role: 'appMenu' as const, label: input.name }]
        : []),
      {
        label: 'File',
        submenu: [
          ...(allowMulti
            ? [
                {
                  label: 'New Window',
                  accelerator: 'CmdOrCtrl+N',
                  click: () => {
                    handle.newWindow()
                  },
                } as Electron.MenuItemConstructorOptions,
              ]
            : []),
          { role: 'close' },
        ],
      },
      { role: 'editMenu' },
      { role: 'viewMenu' },
      { role: 'windowMenu' },
    ]
    Menu.setApplicationMenu(Menu.buildFromTemplate(template))
  }

  // IPC: let the renderer ask the main process to spawn a
  // new window (used by in-app "New Window" buttons / palette
  // commands, independent of the menu accelerator).
  ipcMain.handle('rock:new-window', () => {
    handle.newWindow()
  })

  // IPC: respond with the current slab map. Renderer calls
  // this on mount to avoid races with the push-based slab-map
  // event (which can fire before React subscribes).
  ipcMain.handle('rock:get-slab-map', () => compiled.slabIdByName)

  // IPC: respond with the current workspace metadata.
  ipcMain.handle('rock:get-workspace', () => compiled.workspace)

  app.whenReady().then(() => {
    buildMenu()
    createWindow()
  })

  app.on('window-all-closed', async () => {
    await gracefulShutdown()
    app.quit()
  })

  app.on('before-quit', async event => {
    if (shuttingDown) return
    event.preventDefault()
    await gracefulShutdown()
    app.exit(0)
  })

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      shuttingDown = false
      createWindow()
    }
  })

  return handle
}

/**
 * The one-call main-process entry. Collapses ~50 lines of
 * Electron + manager + IPC boilerplate into:
 *
 *     import { boot } from '@cluesurf/term/boot'
 *     import workspace from '../.tool/term/workspace'
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
  shell,
  type BrowserWindowConstructorOptions,
} from 'electron'
import path from 'node:path'
import { existsSync, mkdirSync } from 'node:fs'
import { spawn } from 'node:child_process'
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
import {
  TermBundleStore,
  registerTermProtocol,
  registerTermProtocolSchemes,
} from '@/desktop/term-protocol'
import {
  findProjectToolFolder,
  loadProjectState,
  saveProjectState,
  type ProjectState,
  type TabState,
} from '@/node'
import { startTermIpcServer } from '@/node/ipc-server'
import {
  hydrateTree,
  serializeTree,
  type TreeNode,
} from '@/base/tree'

// Register the term:// scheme as privileged. Must run
// BEFORE app.whenReady(). Side-effect at module load.
registerTermProtocolSchemes()

// Skip cookie encryption (and thus the macOS Keychain
// "Safe Storage" prompt that fires on every fresh build
// hash of an unsigned binary). Term doesn't store any
// secrets in session cookies — it's a terminal workspace,
// not a browser — so the encryption layer is dead weight
// here. Removing it means dev rebuilds stop pestering for
// the login password, and end users on signed builds get
// a slightly faster cold start. Must be set before
// app.whenReady().
app.commandLine.appendSwitch('disable-features', 'CookieEncryption')

/**
 * Rebuild a WorkspaceDefinition from persisted TabState[],
 * preserving the original workspace's name + per-slab env
 * but replacing the slabs map with the persisted list.
 * Persisted cwds win.
 */
function hydrateWorkspaceFromState(
  original: WorkspaceDefinition,
  tabs: TabState[],
): WorkspaceDefinition {
  const slabs: WorkspaceDefinition['slabs'] = {}
  for (const tab of tabs) {
    // Reuse the original config for that name if it exists
    // (so workspace-level program / args / command stick),
    // otherwise spawn a default shell.
    const base = original.slabs[tab.name] ?? {}
    slabs[tab.name] = {
      ...base,
      cwd: tab.cwd ?? base.cwd,
    }
  }
  return { ...original, slabs }
}

export interface BootInput {
  /** App name (shown in menu bar, dock, Cmd+Tab). */
  name: string
  /** Workspace from `workspace({...})` in `.tool/term/workspace.ts`. */
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
  /**
   * Pre-compiled JIT bundles exposed via the term://
   * protocol. Key is the URL filename (e.g. 'layout.js').
   * Renderer imports them with
   * `await import('term://user/layout.js')`.
   */
  userBundles?: Record<string, string>
  /**
   * Default working directory used for any slab whose
   * config doesn't specify one. Set by the host shell to
   * the project root the user launched at (e.g. the
   * `--cwd=` arg `term` passed when starting Term.app).
   * Without this, PTYs default to `process.cwd()` of the
   * Electron main process, which is the .app bundle path
   * and breaks tools like `claude --resume` that look up
   * sessions by encoding the current cwd.
   */
  defaultCwd?: string
}

export interface BootWindowOptions {
  width?: number
  height?: number
  title?: string
  background?: string
  transparent?: boolean
  /**
   * Set explicitly to opt OUT of the frameless default and
   * back into a standard macOS window with traffic-lights.
   * Pair with `titleBarStyle` to control the title bar.
   */
  frame?: boolean
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

  // Per-project persisted state — restores tabs + cwds
  // from the last session if available. Lives at
  // <projectRoot>/.tool/term/base.json. Outside any project,
  // Walk up from the project root (the cwd the user
  // launched Term at via the `term` CLI or via the
  // `defaultCwd` passed by the host). Falls back to
  // process.cwd() — which inside Term.app is the bundle
  // path, useless for finding the project's `.tool/term/`.
  // Without this, TERM_CWD / `term <path>` would fail to
  // locate an existing .tool/term/ on startup.
  let toolFolderPath = findProjectToolFolder(
    input.defaultCwd ?? process.cwd(),
  )
  const persisted = toolFolderPath
    ? loadProjectState(toolFolderPath)
    : null
  const persistedWindow = persisted?.windows?.[0]

  // If we have persisted tabs, hydrate the workspace from
  // them so spawn order + names + cwds match last session.
  // Otherwise use the workspace the consumer passed in.
  const effectiveWorkspace =
    persistedWindow && persistedWindow.tabs.length > 0
      ? hydrateWorkspaceFromState(input.workspace, persistedWindow.tabs)
      : input.workspace

  // Compile workspace
  const compiled = compileWorkspace(effectiveWorkspace)

  // Live cwd map — slabId → last-known cwd. Initial cwd
  // from compileWorkspace; updated by OSC 7 reports.
  const liveCwds = new Map<string, string>()
  for (const slab of compiled.slabs) {
    liveCwds.set(slab.id, slab.cwd)
  }
  // Labels keyed by slab NAME (stable across sessions).
  const liveLabels = new Map<string, string>()
  for (const tab of persistedWindow?.tabs ?? []) {
    if (tab.label) liveLabels.set(tab.name, tab.label)
  }

  // Debounced save trigger. Coalesces rapid changes
  // (eg cwd reports during a fast cd loop) into a single
  // file write.
  let saveTimer: NodeJS.Timeout | null = null

  // Re-detect a project `.tool/term/` on every save attempt.
  // The user may have created one after launch (via
  // `term bind`, `mkdir .tool`, or any other tool). Once
  // found, the path sticks and subsequent saves go
  // there. Cheap (fs.existsSync walking up a few dirs)
  // and skipped entirely once cached.
  function ensureToolFolder(): string | null {
    if (toolFolderPath) return toolFolderPath
    toolFolderPath = findProjectToolFolder(
      input.defaultCwd ?? process.cwd(),
    )
    return toolFolderPath
  }

  function scheduleSave() {
    if (!ensureToolFolder()) return
    if (saveTimer) clearTimeout(saveTimer)
    saveTimer = setTimeout(persistNow, 400)
  }
  function persistNow() {
    // Capture the folder path in a local so the type
    // narrows from `string | null` to `string` for the
    // save call at the end. `ensureToolFolder()` returns
    // it, so this also avoids two property reads.
    const folder = ensureToolFolder()
    if (!folder) return
    if (saveTimer) {
      clearTimeout(saveTimer)
      saveTimer = null
    }
    const focused = BrowserWindow.getFocusedWindow()
    const tabs: TabState[] = compiled.slabs.map(slab => ({
      name: slab.name,
      label: liveLabels.get(slab.name),
      cwd: liveCwds.get(slab.id) ?? slab.cwd,
    }))
    const state: ProjectState = {
      version: 1,
      windows: [
        {
          tabs,
          activeIndex: 0,
          // Strip runtime-only `id`s before writing to
          // disk. Keeps base.local.json clean for hand
          // editing.
          tree: liveTree
            ? (serializeTree(liveTree) as unknown as TreeNode[])
            : undefined,
          position: focused
            ? (() => {
                const b = focused.getBounds()
                return { x: b.x, y: b.y, width: b.width, height: b.height }
              })()
            : undefined,
        },
      ],
    }
    saveProjectState(folder, state)
  }

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
    // Flush state to .tool/term/base.json before we exit so the
    // next launch can restore tabs + cwds.
    try {
      persistNow()
    } catch {
      // swallow — persistence is best-effort
    }
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
        // Fall through: explicit call-site override →
        // slab's own cwd → host's defaultCwd. The last
        // step is critical: without it `claude --resume`
        // and any other tool that resolves state by cwd
        // breaks because PTYs would land in the .app
        // bundle path.
        cwd: options.cwd ?? cfg?.cwd ?? input.defaultCwd,
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
      win.webContents.send('term:focus', { slabId: id })
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
    // launched). electron-vite outputs main / preload /
    // renderer under <appPath>/make/ (we override its
    // default `out/` to keep build outputs consistent
    // with the rest of the workspace).
    return path.join(app.getAppPath(), 'make', filename)
  }

  let primarySpawnDone = false

  function createWindow(): BrowserWindow {
    const iconPath = locateIcon()
    const opts = input.window ?? {}

    // Frameless by default: removes the macOS title bar +
    // traffic-light buttons entirely so the sidebar can
    // start at y=0 without a reserved gap. Window movement
    // happens via the `<Slab>`'s `data-term-drag` region.
    // Close / minimize / maximize stay reachable via the
    // standard keyboard shortcuts (Cmd+W, Cmd+M, Cmd+Ctrl+F).
    // Users can opt back into a normal title bar by passing
    // `window: { frame: true }` (or any explicit titleBarStyle)
    // to bootTerm — for those, we honor the supplied value
    // and don't go frameless.
    const wantsFrame = opts.frame === true || opts.titleBarStyle !== undefined
    const baseOptions: BrowserWindowConstructorOptions = {
      width: opts.width ?? 1400,
      height: opts.height ?? 900,
      title: opts.title ?? input.name,
      backgroundColor: opts.background ?? '#0b0d10',
      ...(wantsFrame
        ? {
            frame: opts.frame ?? true,
            titleBarStyle: opts.titleBarStyle ?? 'hiddenInset',
          }
        : { frame: false }),
      transparent: opts.transparent,
      fullscreen: opts.fullscreen,
      minWidth: opts.minWidth,
      minHeight: opts.minHeight,
      show: false,
      webPreferences: {
        preload: locateAsset('preload/index.mjs'),
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

    // Any `window.open(url)` from the renderer (xterm
    // internals, third-party addons, plain anchor clicks)
    // should open in the user's default browser — NOT in a
    // new Electron BrowserWindow (the "inline browser"
    // popup). Returning 'deny' from the handler tells
    // Electron not to create a window; we route the URL
    // to the OS via shell.openExternal.
    win.webContents.setWindowOpenHandler(({ url }) => {
      if (url.startsWith('http://') || url.startsWith('https://') ||
          url.startsWith('mailto:') || url.startsWith('file://')) {
        void shell.openExternal(url)
      }
      return { action: 'deny' }
    })
    // Also block in-place navigation away from the app
    // (clicking a link that would replace the renderer).
    win.webContents.on('will-navigate', (event, url) => {
      if (url.startsWith('http://') || url.startsWith('https://') ||
          url.startsWith('mailto:')) {
        event.preventDefault()
        void shell.openExternal(url)
      }
    })

    if (process.env.ELECTRON_RENDERER_URL) {
      win.loadURL(process.env.ELECTRON_RENDERER_URL)
    } else {
      win.loadFile(locateAsset('renderer/index.html'))
    }

    // DevTools open only when explicitly requested via
    // `bootTerm({ devtools: 'always' })` or the
    // TERM_DEVTOOLS env var. The previous default ('auto')
    // popped DevTools on every dev-mode launch which is
    // disruptive in normal use — Cmd+Option+I is still
    // wired by Electron's default editMenu / viewMenu for
    // on-demand opening.
    const devtoolsMode = input.devtools ?? 'never'
    const wantDevtools =
      devtoolsMode === 'always' || Boolean(process.env.TERM_DEVTOOLS)
    if (wantDevtools) {
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
            // Pass slab.id so TerminalManager keys the
            // runtime by the SAME id we already sent the
            // renderer in `term:slab-map`. Without this the
            // renderer's slabId never matches what the
            // manager has, so writes / data events silently
            // fail.
            await manager.createSlab({
              id: slab.id,
              workspaceId: slab.workspaceId,
              tabId: slab.tabId,
              name: slab.name,
              cwd: slab.cwd ?? input.defaultCwd,
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
        win.webContents.send('term:slab-map', compiled.slabIdByName)
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
  ipcMain.handle('term:new-window', () => {
    handle.newWindow()
  })

  // IPC: respond with the current slab map. Renderer calls
  // this on mount to avoid races with the push-based slab-map
  // event (which can fire before React subscribes).
  ipcMain.handle('term:get-slab-map', () => compiled.slabIdByName)

  // IPC: respond with the current workspace metadata.
  ipcMain.handle('term:get-workspace', () => compiled.workspace)

  // Live sidebar tree. null = consumer hasn't set one yet
  // (use flat fallback). Persisted from .tool/term/base.json on
  // load + saved on every term:save-tree IPC.
  // Hydrate the persisted tree: the saved JSON has no
  // `id` field on any node (serializeTree strips them
  // because ids are runtime-only). We mint fresh ids
  // here so React keys / drag identity / findNode work
  // immediately. Tolerates old saves that DO have ids —
  // hydrateTree discards them.
  let liveTree: TreeNode[] | null = persistedWindow?.tree
    ? hydrateTree(persistedWindow.tree as unknown as Parameters<typeof hydrateTree>[0])
    : null

  ipcMain.handle('term:get-tree', () => liveTree)
  ipcMain.handle(
    'term:save-tree',
    (_event, tree: TreeNode[]) => {
      if (!Array.isArray(tree)) return
      liveTree = tree
      scheduleSave()
    },
  )

  // IPC: open the per-project settings file in the user's
  // default editor (Cmd+, in the renderer). If the project
  // has no .tool/term/ yet, create one at the launched cwd and
  // wire it into the live persistence path so subsequent
  // edits also save there. Then flush current state (live
  // tree + cwds + window bounds) so the file the user opens
  // already contains real, current data — not a stale or
  // empty boilerplate.
  ipcMain.handle('term:open-settings', async () => {
    const folder =
      toolFolderPath ??
      path.join(input.defaultCwd ?? process.cwd(), '.tool')
    mkdirSync(folder, { recursive: true })
    if (!toolFolderPath) {
      toolFolderPath = folder
    }
    persistNow()
    const fileLocal = path.join(folder, 'base.local.json')

    // Editor selection order:
    //   1. $TERM_EDITOR  (Term-specific override)
    //   2. $VISUAL       (Unix convention for GUI editor)
    //   3. $EDITOR       (Unix convention)
    //   4. common GUI editors in PATH: code, cursor, subl
    //   5. fall back to macOS default app via `open`
    // We DON'T use shell.openPath because it always defers
    // to the OS file association (which on most machines
    // is whatever the user set in Finder's "Open with",
    // not necessarily their dev editor).
    //
    // Important: spawn through the user's LOGIN shell so
    // PATH has shell-rc additions. Electron apps launched
    // from Finder inherit a stripped PATH from launchd
    // that often doesn't include /usr/local/bin or
    // ~/.local/bin where `code` is symlinked.
    const userShell = process.env.SHELL ?? '/bin/zsh'
    const explicit =
      process.env.TERM_EDITOR ??
      process.env.VISUAL ??
      process.env.EDITOR
    const chain = explicit ? [explicit] : ['code', 'cursor', 'subl']
    // Shell-escape the file path (single-quote, escape any
    // embedded single quote). Filenames inside a project's
    // .tool/term/ dir won't normally contain quotes, but it's
    // cheap insurance.
    const quoted = `'${fileLocal.replace(/'/g, `'\\''`)}'`
    const script =
      chain
        .map(cmd => `command -v ${cmd} >/dev/null 2>&1 && exec ${cmd} ${quoted}`)
        .join(' || ') + ` || exec open ${quoted}`
    const child = spawn(userShell, ['-lc', script], {
      stdio: 'ignore',
      detached: true,
    })
    child.unref()
  })

  // IPC: cwd change from Dock's OSC 7 handler. Update the
  // live map + schedule a state save.
  ipcMain.handle(
    'term:cwd-change',
    (_event, { slabId, cwd }: { slabId: string; cwd: string }) => {
      if (typeof slabId !== 'string' || typeof cwd !== 'string') return
      liveCwds.set(slabId, cwd)
      scheduleSave()
    },
  )

  // IPC: rename a slab label. Persist for next session.
  ipcMain.handle(
    'term:rename-slab',
    (_event, { name, label }: { name: string; label: string }) => {
      if (typeof name !== 'string') return
      if (!label || label.trim().length === 0 || label.trim() === name) {
        liveLabels.delete(name)
      } else {
        liveLabels.set(name, label.trim())
      }
      scheduleSave()
    },
  )

  // IPC: toggle native macOS full-screen on the focused
  // window. Backstop for the View menu's "Toggle Full Screen"
  // (Ctrl+Cmd+F) — explicit binding in case the menu role
  // doesn't intercept.
  ipcMain.handle('term:toggle-fullscreen', () => {
    const win = activeWindow()
    if (!win || win.isDestroyed()) return
    win.setFullScreen(!win.isFullScreen())
  })

  // IPC: open URL in user's default browser. Used by the
  // terminal's custom link provider when a URL is clicked.
  ipcMain.handle('term:open-external', async (_event, url: string) => {
    if (typeof url !== 'string' || url.length === 0) return
    await shell.openExternal(url)
  })

  // IPC: open a local file/dir path. Defers to the OS via
  // shell.openPath — opens files in the default editor and
  // dirs in Finder/Explorer.
  ipcMain.handle('term:open-path', async (_event, filePath: string) => {
    if (typeof filePath !== 'string' || filePath.length === 0) return
    const expanded = filePath.startsWith('~/')
      ? path.join(process.env.HOME ?? '', filePath.slice(2))
      : filePath
    return await shell.openPath(expanded)
  })

  // IPC: spawn a new slab at runtime. Caller can pass
  // { name?, program?, cwd?, command? }. We mint an id,
  // create the slab, update slabIdByName, and broadcast
  // the new map so every renderer's sidebar/store updates.
  ipcMain.handle('term:new-slab', async (_event, opts: {
    name?: string
    program?: string
    cwd?: string
    command?: string
  } = {}) => {
    const usedNames = new Set(Object.keys(compiled.slabIdByName))
    let name = opts.name
    if (!name) {
      // Auto-generate: term-2, term-3, …
      let n = 2
      while (usedNames.has(`term-${n}`)) n += 1
      name = `term-${n}`
    }
    if (usedNames.has(name)) {
      throw new Error(`slab name '${name}' already exists`)
    }
    const { createId } = await import('@/base/ids')
    const id = createId('slab')
    compiled.slabIdByName[name] = id
    const tabId = compiled.workspace.tabs[0]!.id
    // Pick the cwd: explicit opt → project default → as a
    // last resort process.cwd(). Inside Term.app, process.cwd()
    // is the bundle path, so the defaultCwd fallback is what
    // actually keeps new shells inside the user's project.
    const slabCwd = opts.cwd ?? input.defaultCwd ?? process.cwd()
    await manager.createSlab({
      id,
      workspaceId: compiled.workspace.id,
      tabId,
      name,
      cwd: slabCwd,
      program: opts.program,
      command: opts.command,
      cols: 80,
      rows: 24,
    })
    // Push the new slab into compiled.slabs so persistNow's
    // `compiled.slabs.map(...)` includes it. Without this,
    // runtime-spawned slabs (created when the user clicks a
    // tree leaf that hasn't been spawned yet, or via Cmd+T)
    // never appear in base.local.json and their cwd is lost
    // on next launch.
    const now = Date.now()
    compiled.slabs.push({
      id,
      workspaceId: compiled.workspace.id,
      tabId,
      name,
      cwd: slabCwd,
      program: opts.program ?? '',
      args: [],
      command: opts.command,
      env: {},
      cols: 80,
      rows: 24,
      status: 'idle',
      createdAt: now,
      updatedAt: now,
    })
    // Record initial cwd for the new slab so it persists
    // until a shell-emitted OSC 7 updates it.
    liveCwds.set(id, slabCwd)
    // Broadcast updated slab-map to every open window so
    // every sidebar updates.
    for (const w of wins) {
      if (!w.isDestroyed()) {
        w.webContents.send('term:slab-map', compiled.slabIdByName)
      }
    }
    // New tab → structural change → persist.
    scheduleSave()
    return { name, id }
  })

  // IPC: list of available user bundles (so the renderer
  // knows whether to dynamic-import a user layout or fall
  // back to the default).
  const bundleStore = new TermBundleStore()
  for (const [key, code] of Object.entries(input.userBundles ?? {})) {
    bundleStore.set(key, code)
  }
  ipcMain.handle('term:get-user-bundles', () => bundleStore.keys())

  app.whenReady().then(() => {
    registerTermProtocol(bundleStore)
    buildMenu()
    createWindow()
    // Start the CLI IPC server (Unix-domain socket) so
    // `term list / send / focus / spawn / kill` can talk
    // to this running Term.app. Idempotent — safe even if
    // a stale socket exists from a crashed prior run.
    startTermIpcServer(dispatchCliCommand)
  })

  // CLI command dispatcher. Receives { cmd, args } from
  // the IPC server (Unix-socket connection from `term` CLI)
  // and returns the data to serialize back.
  async function dispatchCliCommand(
    cmd: string,
    args: unknown,
  ): Promise<unknown> {
    const a = args as Record<string, unknown>
    switch (cmd) {
      case 'ping':
        return { ok: true, name: input.name }
      case 'list-slabs': {
        return compiled.slabs.map(s => ({
          name: s.name,
          status: s.status,
          cwd: liveCwds.get(s.id) ?? s.cwd,
          program: s.program,
        }))
      }
      case 'send': {
        const slabName = String(a.slab ?? '')
        const text = String(a.text ?? '')
        const id = compiled.slabIdByName[slabName]
        if (!id) throw new Error(`unknown slab: ${slabName}`)
        manager.write(id, text)
        return { sent: text.length }
      }
      case 'focus': {
        const slabName = String(a.slab ?? '')
        const id = compiled.slabIdByName[slabName]
        if (!id) throw new Error(`unknown slab: ${slabName}`)
        handle.focus(slabName)
        const win = activeWindow()
        if (win && !win.isDestroyed()) win.show()
        return { focused: slabName }
      }
      case 'spawn': {
        // Reuse the same handler used by Cmd+T in the
        // renderer so spawn semantics stay consistent.
        const baseName = a.name ? String(a.name) : undefined
        const cwd = a.cwd ? String(a.cwd) : undefined
        const usedNames = new Set(Object.keys(compiled.slabIdByName))
        let name = baseName
        if (!name) {
          let n = 2
          while (usedNames.has(`term-${n}`)) n += 1
          name = `term-${n}`
        }
        if (usedNames.has(name)) {
          throw new Error(`slab name '${name}' already exists`)
        }
        const { createId } = await import('@/base/ids')
        const id = createId('slab')
        compiled.slabIdByName[name] = id
        const tabId = compiled.workspace.tabs[0]!.id
        const effectiveCwd = cwd ?? input.defaultCwd
        await manager.createSlab({
          id,
          workspaceId: compiled.workspace.id,
          tabId,
          name,
          cwd: effectiveCwd,
          cols: 80,
          rows: 24,
        })
        liveCwds.set(id, effectiveCwd ?? process.cwd())
        for (const w of wins) {
          if (!w.isDestroyed()) {
            w.webContents.send('term:slab-map', compiled.slabIdByName)
          }
        }
        scheduleSave()
        return { name, id }
      }
      case 'kill': {
        const slabName = String(a.slab ?? '')
        const id = compiled.slabIdByName[slabName]
        if (!id) throw new Error(`unknown slab: ${slabName}`)
        manager.kill(id)
        return { killed: slabName }
      }
      default:
        throw new Error(`unknown cli cmd: ${cmd}`)
    }
  }

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

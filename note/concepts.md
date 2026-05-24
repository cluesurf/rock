# Concepts

The mental model behind Rock, mapped 1:1 to the code.

## Slab

A **slab** is a single PTY process — a shell, an `npm
run dev`, a `tail -f`, anything you spawn. One PTY, one
slab. The slab has:

- a **name** (stable id used by IPC + tree references)
- a **command** / **program** / **args** / **cwd** / **env**
- a **status** (`idle`, `starting`, `running`, `exited`,
  `failed`)
- a **PID** (the process at the other end of the PTY)

Slabs are defined in `.rock/code/index.tsx`'s
`workspace({ slabs: {...} })`. New ones are spawned at
runtime via `Cmd+T`, `rock spawn <name>`, or the
`window.app.newSlab()` IPC.

Slab name vs slab id:
- `name` is what you reference from sidebar tree, CLI,
  layout JSX
- `id` is the internal identifier (a UUID-tagged string)
- The mapping `slabIdByName` is broadcast to the renderer
  on every change

## Workspace

A **workspace** is a collection of slabs + a name. One
project = one workspace. Compiled by
`compileWorkspace()` into `{ workspace, slabs, slabIdByName }`
which the runtime uses to spawn the actual PTYs.

```ts
import { workspace } from '@cluesurf/rock'

const ws = workspace({
  name: 'my-app',
  slabs: {
    web:  { cwd: './site', command: 'pnpm dev' },
    api:  { cwd: './base', command: 'pnpm dev' },
    logs: { command: 'tail -f logs/app.log' },
  },
})
```

`env` and `root` can be set workspace-level (apply to all
slabs) or per-slab (slab wins).

## Tree

The **tree** is the visual structure of the sidebar — what
groups exist, in what order, what nests under what. Stored
as `TreeNode[]`. Two node kinds:

- `GroupNode` — has `label`, `collapsed`, `children`
- `LeafNode` — has `slabName` and optional `label`

A leaf points to a slab by `slabName`. Many leaves can
point to the same slab (clone a tab to appear in multiple
groups). A slab can exist with no leaf (background slab,
not shown in sidebar).

The tree is persisted to `.rock/base.local.json` (per
machine) — the initial layout can be checked into
`.rock/base.json` (committed) and Rock merges them on
load.

See `cluesurf/note/library/rock/sidebar-tree-design.md`
for the full data model + edit operations.

## Dock

A **`<Dock name="...">`** is the React component that
renders an xterm.js terminal for a given slab name. The
Dock subscribes to the slab's PTY data events via IPC and
sends keystrokes back. One Dock per slab being shown.

In the default Rock shell, every slab in the tree gets a
Dock — only the active one is visible (`display: block`),
the rest are hidden but keep running. Switching tabs is
instant; scrollback is preserved.

## Slab IPC

The Electron main process owns the PTYs (via `node-pty`).
The renderer talks to the main process over an IPC channel
defined in `code/base/protocol.ts`:

```
slab:write    { slabId, data }      keystrokes → PTY
slab:resize   { slabId, cols, rows }  resize event → PTY
slab:kill     { slabId }            kill the PTY
slab:create   { ...slab opts }      spawn a new one
                                    ←  slab:data { slabId, data }
                                    ←  slab:status { slabId, status }
                                    ←  slab:exit { slabId, code, signal }
```

The face library wraps this in a `TerminalApi` exposed
via context. Components don't talk to IPC directly.

## CLI IPC

A second IPC mechanism — a Unix-domain socket at
`$TMPDIR/rock.sock` — lets the `rock` CLI talk to a
running Rock.app. JSON-lines over the socket. Commands:

```
ping            → { ok, name }
list-slabs      → [{ name, status, cwd, program }, ...]
send            { slab, text }
focus           { slab }
spawn           { name?, cwd? }   → { name, id }
kill            { slab }
```

Implementation in `code/node/ipc-server.ts` (server side)
and `base/call/rock.ts` (client). The Homebrew cask
installs the CLI; under the hood it's a bash launcher
that execs Rock.app's bundled Electron in Node mode
(`ELECTRON_RUN_AS_NODE=1`).

## Workspace persistence

Per-project state lives in `.rock/`:

```
.rock/
├── code/
│   └── index.tsx       Your workspace + Layout + Sidebar
├── base.json           Initial state (committable)
├── base.local.json     Per-machine state (gitignored)
└── .gitignore          Auto-managed (covers .local + .cache)
```

`base.json` and `base.local.json` are field-merged on
load — local wins. `base.json` is for the author's
shared baseline (eg. "this project's tabs start as
web/api/logs"). `base.local.json` is your machine's
state (window position, last cwds, your custom tab order).

## Theme

A **`RockTheme`** is a plain data object — colors, font,
cursor style. Pass to `<Slab theme={...}>` to apply.

```ts
import { dracula } from '@cluesurf/rock/theme/dracula'
import { rockDark } from '@cluesurf/rock/theme/rock/dark'
// ...

<Slab theme={dracula}>
```

Per-theme imports keep the bundle small — you only load
what you use. Each theme exposes every ANSI slot
(`black`, `red`, … `brightWhite`) plus chrome colors
(`background`, `foreground`, `selectionBackground`,
`accent`, etc.) plus optional `font`.

Themes ship with the lib:
- `dracula`, `oneDark`, `solarizedDark`, `solarizedLight`,
  `nord`, `gruvboxDark`, `monokai`, `tokyoNight`
- `cluesurf/dark`, `cluesurf/light` (the house theme)

The Slab projects every color as a CSS custom property
(`--rock-bg`, `--rock-fg`, `--rock-accent`, etc.) so the
sidebar / palette / status bar styles via the Tailwind
preset automatically follow the theme.

## Boot flow

```
launch
  ↓
  base/boot/index.ts (renderer + main start)
    findRockFolders(cwd)
    loadRockFolder(.rock)   ← workspace
    bundleUserModule(.rock/code/index.tsx)
                            ← compiled to "app.js" bundle
    boot({ workspace, userBundles })
                            ↓
                            code/boot/index.ts (lib)
                              compileWorkspace
                              loadProjectState (base.json + base.local.json)
                              hydrate tabs from persisted state
                              startRockIpcServer (for CLI)
                              registerRockProtocol (for rock://)
                              createWindow
                                ↓
                                Renderer:
                                  mount <App />
                                    ← loads "app.js" if present
                                    ← else falls back to DefaultShell
                                  installExternalBridge (React, etc. on globalThis)
                                  <Slab theme>
                                    <TreeView />
                                    <Dock /> per slab
                                    <Keys /> for global hotkeys
```

## Glossary

| Term       | Means                                                   |
| ---------- | ------------------------------------------------------- |
| Slab       | A PTY process — the "what" of a terminal tab            |
| Leaf       | A node in the sidebar tree pointing at a slab           |
| Group      | A folder-like node containing leaves and other groups   |
| Tree       | The full `TreeNode[]` sidebar structure                 |
| Workspace  | A named collection of slabs + env + root                |
| Window     | An Electron BrowserWindow showing one workspace         |
| Dock       | The React component that renders xterm for one slab     |
| .rock/     | The per-project config + state directory                |
| rock://    | Custom Electron protocol serving JIT bundles            |
| OSC 7      | Shell escape for cwd reporting; Rock uses for tracking  |

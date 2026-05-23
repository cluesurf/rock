<br/>
<br/>
<br/>
<br/>
<br/>
<br/>

<p align='center'>
  <img src='https://github.com/cluesurf/rock/blob/make/view/rock.png?raw=true' height='256'/>
</p>

<h3 align='center'>@cluesurf/rock</h3>
<p align='center'>
  A Hackable Terminal ⊡
</p>

<br/>
<br/>
<br/>

## Overview

Rock is a TypeScript library for building Electron-based terminal
workspace apps. It packages the slow parts (PTY lifecycle, IPC bridge,
xterm.js rendering, layout splits, sidebar tree, SQLite session
persistence) so a consumer can focus on workspace UX, custom slab
content, and orchestration.

The public v1 API is intentionally narrow. A workspace is a named map of
slabs. Layouts are written in JSX. Sidebars are written in JSX. No graph
DSL, no plugin runtime to learn first. Compose like a normal React app
with terminal slabs as components.

The internal model is richer (stable slab IDs, IPC protocol, status
events, persistent store) so that more advanced workspace orchestration,
auto-discovery, plugins, and a daemon can be layered in later without
reshaping the public API.

A consumer ships a `.rock/` folder at the project root containing
`workspace.ts`, `layout.tsx`, `sidebar.tsx`, etc. The runtime loads
those, spawns one PTY per slab, and renders the React UI inside
Electron.

## Architecture

Four layers, separated so the wrong runtime never imports the wrong
code.

| Layer                            | Module                     | Runtime  |
| -------------------------------- | -------------------------- | -------- |
| Pure types + IPC protocol        | `@cluesurf/rock/base/*`    | any      |
| node-pty manager + SQLite store  | `@cluesurf/rock/node/*`    | Node     |
| React components + Zustand store | `@cluesurf/rock/face/*`    | browser  |
| Electron IPC bridge helpers      | `@cluesurf/rock/desktop/*` | Electron |

| Concept           | Where                                                                   |
| ----------------- | ----------------------------------------------------------------------- |
| Slab lifecycle    | `code/node/terminal-manager.ts`                                         |
| IPC protocol      | `code/base/protocol.ts`                                                 |
| Workspace compile | `code/base/compile-workspace.ts`                                        |
| Persistence       | `code/node/workspace-store.ts`                                          |
| `.rock/` loader   | `code/node/rock-folder.ts`                                              |
| JSX layout        | `code/face/layout-components.tsx` (`<Split>`, `<Slab>`)                 |
| JSX sidebar       | `code/face/sidebar-components.tsx` (`<SidebarSection>`, `<SlabButton>`) |
| Renderer slab     | `code/face/terminal-slab.tsx` (xterm.js wrapper)                        |
| Preload bridge    | `code/desktop/preload-api.ts`                                           |
| Main handler      | `code/desktop/main-handler.ts`                                          |

Slab records carry stable IDs. Symbolic slab names from the user's
workspace map to those IDs at compile time. JSX components reference the
symbolic name (`<Slab name="web" />`), the store does the lookup.

The React layer never imports node-pty. node-pty never imports React.
Electron IPC is the membrane between them.

## Installation

```bash
pnpm add @cluesurf/rock
pnpm add node-pty better-sqlite3 \
  @xterm/xterm @xterm/addon-fit \
  @xterm/addon-web-links @xterm/addon-search \
  zustand react react-dom
```

Peers are optional. Install only the ones your runtime context needs.

## Quick Start

A minimum viable terminal workspace app is three files.

### `boot/main.ts`

```ts
import { app, BrowserWindow } from 'electron'
import path from 'node:path'
import { TerminalManager } from '@cluesurf/rock/node/terminal-manager'
import {
  wireTerminalMain,
  createWindowEmitter,
} from '@cluesurf/rock/desktop/main-handler'

let win: BrowserWindow | null = null

const manager = new TerminalManager({
  emit: createWindowEmitter(() => win),
})

wireTerminalMain({ manager })

app.whenReady().then(() => {
  win = new BrowserWindow({
    width: 1400,
    height: 900,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  })
  win.loadURL(
    process.env.DEV_SERVER_URL ?? `file://${__dirname}/index.html`,
  )
})

app.on('before-quit', () => manager.shutdown())
```

### `boot/preload.ts`

```ts
import { exposeTerminalApi } from '@cluesurf/rock/desktop/preload-api'

exposeTerminalApi()
```

### `code/app.tsx`

```tsx
import { createRoot } from 'react-dom/client'
import {
  TerminalApiProvider,
  TerminalEvents,
  SidebarTree,
  WorkspaceView,
  useTerminalStore,
} from '@cluesurf/rock/face'

const api = (window as any).app.terminal

function App() {
  const workspace = useTerminalStore(state => state.workspaces[0])
  return (
    <TerminalApiProvider api={api}>
      <TerminalEvents />
      <div style={{ display: 'flex', height: '100vh' }}>
        <SidebarTree />
        <main style={{ flex: 1 }}>
          {workspace && <WorkspaceView layout={workspace.layout} />}
        </main>
      </div>
    </TerminalApiProvider>
  )
}

createRoot(document.getElementById('root')!).render(<App />)
```

## Define a Workspace

A workspace is a named map of slabs. The slab key is the symbolic name
referenced from JSX layout and sidebar.

```ts
// .rock/workspace.ts
import { defineWorkspace } from '@cluesurf/rock'

export default defineWorkspace({
  name: 'clue',
  slabs: {
    web: { cwd: './site', command: 'pnpm dev' },
    api: { cwd: './base', command: 'pnpm dev' },
    logs: { command: 'tail -f logs/app.log' },
  },
})
```

## JSX Layout

Compose layouts in React. No custom AST, no DSL. `<Split>` is a flex
container; `<Slab>` resolves a symbolic name to its compiled slab ID and
renders an xterm.js terminal.

```tsx
// .rock/layout.tsx
import { Split, Slab } from '@cluesurf/rock/face'

export default function Layout() {
  return (
    <Split horizontal>
      <Slab name="web" />
      <Split vertical>
        <Slab name="api" />
        <Slab name="logs" />
      </Split>
    </Split>
  )
}
```

## JSX Sidebar

```tsx
// .rock/sidebar.tsx
import { SidebarSection, SlabButton } from '@cluesurf/rock/face'

export default function Sidebar() {
  return (
    <>
      <SidebarSection title="App">
        <SlabButton name="web" />
        <SlabButton name="api" />
      </SidebarSection>
      <SidebarSection title="Infra">
        <SlabButton name="logs" />
      </SidebarSection>
    </>
  )
}
```

## Named Commands

```ts
// .rock/commands.ts
import { defineCommands } from '@cluesurf/rock'

export default defineCommands({
  deploy: { command: 'pnpm deploy', cwd: './ops' },
  migrate: { command: 'pnpm migrate', cwd: './base' },
})
```

Wire to a CLI (`rock run deploy`) or to the in-app command palette.

## `.rock/` Folder Convention

```
~/.rock/                 global defaults
project/.rock/           per-project workspace
  workspace.ts           defineWorkspace export
  layout.tsx             JSX layout
  sidebar.tsx            JSX sidebar
  commands.ts            defineCommands export
  theme.ts               theme overrides
```

The runtime walks upward from cwd to find the nearest project `.rock/`,
merges with `~/.rock/`, returns the resolved configuration.

```ts
import {
  findRockFolders,
  loadRockFolder,
} from '@cluesurf/rock/node/rock-folder'

const { projectRoot, globalRoot } = findRockFolders(process.cwd())
const project = projectRoot ? await loadRockFolder(projectRoot) : null
```

## Persistence

Workspaces, tabs, and slabs serialize to SQLite. Live shell memory is
not persisted; on restore, the runtime re-spawns commands.

```ts
import { WorkspaceStore } from '@cluesurf/rock/node/workspace-store'

const store = new WorkspaceStore('~/.rock/state/workspaces.db')
store.saveWorkspace(workspace)
const restored = store.listWorkspaces()
```

## Testing

```bash
pnpm test
```

## Scripts

```bash
pnpm make       # compile to host/
pnpm scan       # tsc watch + tsc-alias watch
pnpm test       # vitest run
pnpm test:watch # vitest watch
pnpm lint       # eslint --fix
```

## License

GPL-3.0-or-later. See [LICENSE](./LICENSE).

## ClueSurf

Made by [ClueSurf](https://clue.surf), meditating on the universe ¤.
Follow the work on [YouTube](https://youtube.com/@cluesurf),
[X](https://x.com/cluesurf),
[Instagram](https://instagram.com/cluesurf),
[Substack](https://cluesurf.substack.com),
[Facebook](https://facebook.com/cluesurf), and
[LinkedIn](https://linkedin.com/company/cluesurf), and browse more of
our open-source work here on [GitHub](https://github.com/cluesurf).

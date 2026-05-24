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

Rock is a **Mac terminal app** plus a **TypeScript library** for
designing your own terminal UI.

The app launches with a sensible default workspace. Drop a
`.rock/code/index.tsx` file at the root of any project and Rock
JIT-compiles it on launch. From that file the entire app surface can be
replaced. The sidebar tree, status bar, command palette, keyboard map,
and theme are all React components you import and recompose.

Nothing about the chrome is fixed. Every part of the interface ships as
a primitive on `@cluesurf/rock/face` and is meant to be swapped,
restyled, or thrown out.

## Install

Mac:

```bash
brew tap cluesurf/tool
brew install --cask cluesurf/tool/rock
```

The cask installs **Rock.app** to `/Applications` and symlinks the
**`rock` CLI** to `/usr/local/bin/rock`.

### A note on size

Rock.app is **~280 MB installed** (~110 MB zipped download). That's the
cost of shipping Chromium plus a Node runtime in one bundle. The same is
true of every Electron app: Slack, Discord, VS Code, Notion, Linear,
1Password, Figma desktop, and ChatGPT desktop all land in the same 200
to 500 MB range for the same reason. The upside is that everything runs
everywhere with no system Node, no system Chromium, etc.. 👍

### Library only

For projects that vendor Rock from npm:

```bash
pnpm add @cluesurf/rock
pnpm add electron node-pty better-sqlite3 esbuild react react-dom
```

The npm package and the desktop app share the same source. Peer
dependencies are optional and only need to be installed for the runtime
context the consumer is targeting.

## Quickstart

```bash
cd ~/code/some-project
rock bind     # scaffolds .rock/code/index.tsx
rock          # launches Rock.app at this project
```

The bound project gains:

```
.rock/
├── code/
│   └── index.tsx        workspace + optional UI components
├── base.json            committed defaults
├── base.local.json      per-machine state (gitignored)
└── .gitignore           managed by Rock
```

A minimal `.rock/code/index.tsx`:

```ts
import { workspace } from '@cluesurf/rock'

export default {
  workspace: workspace({
    name: 'some-project',
    slabs: {
      shell: {},
      web: { cwd: './site', command: 'pnpm dev' },
      api: { cwd: './base', command: 'pnpm dev' },
      logs: { command: 'tail -f logs/app.log' },
    },
  }),
}
```

Relaunching at the same directory spawns those tabs and restores sidebar
layout, window size, and last-known cwds.

## Build your own UI

The `index.tsx` default export accepts a custom `Layout`, `Sidebar`, or
both. Replace one slot and inherit the rest from Rock's default shell.

```tsx
import { workspace } from '@cluesurf/rock'
import {
  Slab, Dock, Nest, Tree, Branch, Leaf,
  Bar, Cell, Palette, Sheet, Toast, Keys,
  useTerminalStore,
} from '@cluesurf/rock/face'
import { rockDark } from '@cluesurf/rock/theme/rock/dark'

function MyLayout() {
  return (
    <Slab theme={rockDark}>
      <Nest direction="horizontal" ratio={0.25}>
        <MySidebar />
        <Nest direction="vertical" ratio={0.7}>
          <Dock name="web" />
          <Dock name="logs" />
        </Nest>
      </Nest>
      <Bar>
        <Cell>{useTerminalStore(s => s.activeSlabName)}</Cell>
      </Bar>
    </Slab>
  )
}

function MySidebar() {
  const slabs = useTerminalStore(s => Object.keys(s.slabIdByName))
  return (
    <Tree>
      {slabs.map(name => (
        <Leaf key={name} name={name} />
      ))}
    </Tree>
  )
}

export default {
  workspace: /* ... */,
  Layout: MyLayout,
  Sidebar: MySidebar,
}
```

Every primitive is independent. A workspace can replace one of them, all
of them, or none. Rock's default UI is itself written in these same
components.

## Architecture

Four layers, separated so the wrong runtime never imports the wrong
code.

| Layer                            | Module                     | Runtime  |
| -------------------------------- | -------------------------- | -------- |
| Pure types + IPC protocol        | `@cluesurf/rock/base/*`    | any      |
| node-pty manager + persistence   | `@cluesurf/rock/node/*`    | Node     |
| React components + Zustand store | `@cluesurf/rock/face/*`    | browser  |
| Electron IPC bridge helpers      | `@cluesurf/rock/desktop/*` | Electron |

| Concept               | Where                            |
| --------------------- | -------------------------------- |
| Slab lifecycle (PTY)  | `code/node/terminal-manager.ts`  |
| IPC protocol          | `code/base/protocol.ts`          |
| Workspace compile     | `code/base/compile-workspace.ts` |
| Per-project state     | `code/node/state-store.ts`       |
| `.rock/` loader       | `code/node/rock-folder.ts`       |
| User bundle JIT       | `code/node/layout-bundle.ts`     |
| CLI socket server     | `code/node/ipc-server.ts`        |
| Layout primitives     | `code/face/{nest,slab,dock}.tsx` |
| Sidebar tree          | `code/face/tree-view.tsx`        |
| Status bar            | `code/face/bar.tsx`              |
| Command palette       | `code/face/palette.tsx`          |
| Modal sheets / toasts | `code/face/{sheet,toast}.tsx`    |
| Hotkey map            | `code/face/keys.tsx`             |
| Preload bridge        | `code/desktop/preload-api.ts`    |
| Main handler          | `code/desktop/main-handler.ts`   |
| Custom URL protocol   | `code/desktop/rock-protocol.ts`  |

Slab records carry stable IDs. Symbolic slab names from the user's
workspace map to those IDs at compile time. JSX components reference the
symbolic name (`<Dock name="web" />`) and the store resolves the lookup.

The React layer never imports node-pty. node-pty never imports React.
Electron IPC is the membrane between them.

## Public surface

### From `@cluesurf/rock`

```ts
workspace, commands // identity helpers for .rock/code/index.tsx
```

### From `@cluesurf/rock/face`

```ts
// Layout primitives
Slab, Dock, Nest

// Sidebar
Tree, Branch, Leaf, TreeView

// Chrome
Bar, Cell, Palette, Sheet, Toast, Keys

// Mounting
mount, TerminalApiProvider, TerminalEvents

// Hooks
useTerminalStore, useTerminalApi, useSlabActivity, useKeys
```

### From `@cluesurf/rock/theme/*`

```
rock/dark
rock/light
dracula
one-dark
solarized-dark
solarized-light
nord
gruvbox-dark
monokai
tokyo-night
```

Each theme is a plain object. Define a custom one:

```ts
import type { RockTheme } from '@cluesurf/rock/base'

export const myTheme: RockTheme = {
  name: 'My Theme',
  font: '"JetBrains Mono", monospace',
  background: '#0a0a0a',
  foreground: '#fafafa',
  accent: '#ff0080',
  // ...
}
```

## The `rock` CLI

Installed alongside Rock.app. Talks to the running app over a
Unix-domain socket.

```bash
rock                          # open Rock.app at $PWD
rock open ~/other-project     # open at another path
rock bind                     # scaffold .rock/code/index.tsx
rock list                     # list active slabs
rock spawn dev --cwd=./api    # spawn a new slab
rock send dev "pnpm test\n"   # send keystrokes
rock focus dev                # focus a slab
rock kill dev                 # close a slab
rock doctor                   # diagnose the install
rock install theme claude     # install Rock themes into Claude Code
```

Useful in deploy scripts, editor commands, and CI hooks.

## State model

Two files per project, field-merged on load.

| File              | Committed | Purpose                               |
| ----------------- | --------- | ------------------------------------- |
| `base.json`       | yes       | Shared defaults (sidebar tree shape)  |
| `base.local.json` | no        | Per-machine (cwds, window pos, sizes) |

Live shell memory is not persisted. On restore, slabs respawn their
original commands.

## Scripts

```bash
pnpm make       # compile to host/
pnpm scan       # tsc watch + tsc-alias watch
pnpm test       # vitest run
pnpm dev        # run Rock.app in dev mode
pnpm package    # package Rock.app for the current platform
pnpm ship       # cut a release (notarize + publish cask)
```

## License

[GPL-3.0-or-later](./LICENSE).

## ClueSurf

Made by [ClueSurf](https://clue.surf), meditating on the universe ¤.
Follow the work on [YouTube](https://youtube.com/@cluesurf),
[X](https://x.com/cluesurf),
[Instagram](https://instagram.com/cluesurf),
[Substack](https://cluesurf.substack.com),
[Facebook](https://facebook.com/cluesurf), and
[LinkedIn](https://linkedin.com/company/cluesurf), and browse more of
our open-source work on [GitHub](https://github.com/cluesurf).

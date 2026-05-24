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
restyled, or thrown out. Like shadcn, you can use the components in
`./base` as a starting point or start over entirely.

<img src='https://github.com/cluesurf/rock/blob/make/view/terminal-with-tons-of-sidebar-tabs.png?raw=true'/>

_See the [./note](https://github.com/cluesurf/rock/tree/make/note)
folder for explanation on the terminal landscape, why we built one,
what's around, and other tidbits._

## Quickstart

Mac:

```bash
brew install --cask cluesurf/tool/rock
```

That installs **Rock.app** to `/Applications` and links the **`rock`
CLI** to `/opt/homebrew/bin/rock`. Two ways to launch:

- **From any terminal**: `rock` opens Rock at the current directory.
- **From Finder**: double-click `Rock.app` in `/Applications`.

No further setup. The default workspace gives you a working terminal
immediately.

<details>
<summary>A note on size (~280 MB)</summary>

Rock.app is ~280 MB installed (~110 MB zipped download). That's the cost
of bundling Chromium plus a Node runtime. Slack, Discord, VS Code,
Notion, Linear, Figma desktop, and ChatGPT desktop all sit in the same
200 to 500 MB range for the same reason. The upside is everything runs
everywhere with no system Node or system Chromium needed.

</details>

## Customizing the Terminal

Bind Rock to any project to gain a per-project `.rock/` folder:

```bash
cd ~/code/some-project
rock bind
```

That scaffolds:

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

The `workspace` prop is the **set of named PTY processes Rock spawns on
launch**. Each entry under `slabs` becomes a tab with its own shell,
command, cwd, and env. Rock keeps them alive, restores them when you
relaunch at the same directory, and lets the rest of the UI (sidebar,
palette, hotkeys) target them by name.

`workspace()` itself is a typed identity helper. Pass-through with
editor autocomplete on the shape.

### Replacing the UI

The default export can include `Layout`, `Sidebar`, or any other React
tree you want. You're not limited to a sidebar + layout pair. **You can
ship zero sidebars, ten sidebars, a floating command bar, a status
ticker, or nothing at all.** The only essentials are `<Slab>` (the
window shell) and one or more `<Dock name="…" />` mounts to attach PTYs
to the DOM. Everything else (`Tree`, `Bar`, `Palette`, `Sheet`, `Toast`,
`Keys`) is a convenience component for common patterns.

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

`ratio` on `<Nest>` is the fraction of the parent's space the **first
child** gets along `direction`. The second child takes the remainder. So
`ratio={0.7}` means 70% / 30%. Only meaningful with exactly two
children. With more, space is split evenly.

Every primitive is independent. A workspace can replace one of them, all
of them, or none. Rock's default UI is itself written in these same
components.

## State

Two files per project, field-merged on load.

| File              | Committed | Purpose                               |
| ----------------- | --------- | ------------------------------------- |
| `base.json`       | yes       | Shared defaults (sidebar tree shape)  |
| `base.local.json` | no        | Per-machine (cwds, window pos, sizes) |

Live shell memory is not persisted. On restore, slabs respawn their
original commands.

You can edit `base.json` directly to add or rearrange tabs without
touching `.rock/code/index.tsx`. Useful for tweaks that don't need
custom components.

## Using the Standalone Library

Rock.app already bundles `@cluesurf/rock` and resolves it for you at
runtime when it JIT-compiles `.rock/code/index.tsx`. **You do not need
to install it for your workspace to work.**

You'd only pull it from npm in two cases:

1. **Editor type checking**. Install as a dev dep so your IDE knows the
   types in your `.rock/code/index.tsx`.

   ```bash
   pnpm add -D @cluesurf/rock
   ```

2. **Embedding Rock's primitives in a non-Rock app**. Rare. You ship a
   terminal pane inside your own Electron app.

   ```bash
   pnpm add @cluesurf/rock
   pnpm add electron node-pty better-sqlite3 esbuild react react-dom
   ```

The npm package and the desktop app share the same source. Peer deps are
optional and only need to be installed for the runtime context you
target.

## Themes

Bundled themes import from `@cluesurf/rock/theme/<name>`:

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

Pass one to the top-level `<Slab>`:

```tsx
import { Slab, Dock } from '@cluesurf/rock/face'
import { tokyoNight } from '@cluesurf/rock/theme/tokyo-night'

function MyLayout() {
  return (
    <Slab theme={tokyoNight}>
      <Dock name="shell" />
    </Slab>
  )
}
```

Define a custom theme:

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

## Public Surface

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

## Claude Code the Terminal

The `.rock/` folder is just files. `base.json` is plain JSON.
`.rock/code/index.tsx` is plain TypeScript. Both invite scripts and AI
agents to compose your terminal for you.

A few ways to wire it up:

**Have Claude scaffold a workspace from a fresh repo.** Point Claude at
`package.json` and ask for a `.rock/code/index.tsx` with the right slabs
(web dev server, API dev server, log tailer, REPL). It picks sensible
defaults based on what scripts and folders exist.

**Auto-rewrite `base.json` per folder.** Drop a script in a git hook or
CI that regenerates tabs based on whatever directories exist:

```ts
// task/sync-tabs.ts
import { readdirSync, writeFileSync } from 'node:fs'

const tabs = readdirSync('./packages').map(name => ({
  name,
  cwd: `./packages/${name}`,
  command: 'pnpm dev',
}))

writeFileSync(
  '.rock/base.json',
  JSON.stringify({ slabs: tabs }, null, 2),
)
```

**Spawn slabs on demand from a Claude tool.** Wrap `rock spawn` in a
tool definition and let the agent open dev servers, tail logs, or run
REPLs as part of its task.

```bash
rock spawn dev --cwd=./packages/api
rock send dev "pnpm vitest --watch\n"
```

**Programmatic focus + send.** Combine `rock list`, `rock focus`,
`rock send` to drive existing tabs from a script. Useful for "make this
test fail, then watch the log."

The CLI commands are stable. Anything you can do through the UI you can
do from a shell script, a Claude tool, or a webhook.

## Development

Quick command list for developing this literal repo.

```bash
pnpm make       # compile to host/
pnpm scan       # tsc watch + tsc-alias watch
pnpm test       # vitest run
pnpm dev        # run Rock.app in dev mode
pnpm package    # package Rock.app for the current platform
pnpm verify     # build + boot-smoke + bundled-deps check
pnpm open       # launch the just-built .app
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

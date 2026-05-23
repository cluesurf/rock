# Rock quickstart

Build your customized terminal in 10 minutes. End-to-end mental model,
pieces, and the wiring.

For the design rationale + tradeoffs, see `rock-positioning.md`. For the
ecosystem context, see `terminal-landscape.md`.

## The mental model

A **rock app** is an Electron window. Inside the window is a
**workspace**. A workspace is a named map of **slabs**. Each slab is one
terminal pane running one command. You describe the workspace in
TypeScript, the layout in JSX, the sidebar in JSX. Rock spawns the
processes, renders the terminals, and wires everything together. You
write three small files and import three functions. That's it.

## The 3 + 3 file pattern

| File                 | Edited by  | Purpose                              |
| -------------------- | ---------- | ------------------------------------ |
| `.rock/workspace.ts` | you        | What slabs exist, what they run      |
| `.rock/layout.tsx`   | you        | How the slabs are arranged on screen |
| `.rock/sidebar.tsx`  | you        | What appears in the left sidebar     |
| `boot/main.ts`       | you (once) | Boots Electron (3 lines)             |
| `boot/preload.ts`    | you (once) | IPC bridge (1 line)                  |
| `code/app.tsx`       | you (once) | Mounts the React app (3 lines)       |

The first 3 files are your customization. The last 3 are boilerplate you
write once and never touch again.

## End-to-end example

A workspace with 3 slabs (web dev server, API dev server, log tail),
split layout, simple sidebar.

### `.rock/workspace.ts`

```ts
import { workspace } from '@cluesurf/rock'

export default workspace({
  name: 'my-app',
  slabs: {
    web: { command: 'pnpm dev', cwd: './site' },
    api: { command: 'pnpm dev', cwd: './base' },
    logs: { command: 'tail -f logs/app.log' },
  },
})
```

### `.rock/layout.tsx`

```tsx
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

### `.rock/sidebar.tsx`

```tsx
import { Group, Item } from '@cluesurf/rock/face'

export default function Sidebar() {
  return (
    <>
      <Group title="App">
        <Item slab="web" />
        <Item slab="api" />
      </Group>
      <Group title="Infra">
        <Item slab="logs" />
      </Group>
    </>
  )
}
```

### `boot/main.ts`

```ts
import { boot } from '@cluesurf/rock/boot'
import workspace from '../.rock/workspace'

boot({ name: 'My App', workspace })
```

### `boot/preload.ts`

```ts
import '@cluesurf/rock/boot/preload'
```

### `code/app.tsx`

```tsx
import { mount, Shell } from '@cluesurf/rock/face'
import Sidebar from '../.rock/sidebar'
import Layout from '../.rock/layout'

mount(
  <Shell
    sidebar={<Sidebar />}
    main={<Layout />}
  />,
)
```

That's the whole app. Run `pnpm dev` and you see your sidebar on the
left, three live terminal panes on the right, your dev servers running.

## Concepts

### Workspace

The top-level container. Has a name and a map of slabs. Optionally a
root directory and shared env vars.

```ts
workspace({
  name:  string                       // shown in sidebar header
  root?: string                       // base cwd for slabs
  env?:  Record<string, string>       // applied to every slab
  slabs: Record<string, SlabOptions>  // the slabs by symbolic name
})
```

### Slab

One terminal pane = one PTY = one command.

```ts
{
  command:    string                  // required: the shell command
  cwd?:       string                  // working dir (default: workspace root)
  shell?:     string                  // shell binary (default: $SHELL)
  args?:      string[]                // shell args
  env?:       Record<string, string>  // slab-specific env
  scrollback?: number                 // line buffer (default: 50000)
  title?:     string                  // display title (default: slab name)
}
```

The **symbolic name** (the map key, e.g. `web`) is how you reference a
slab from layout and sidebar JSX.

### Layout

A React component that arranges slabs visually. Use `<Split>` to divide
space and `<Slab name="...">` to render a specific slab.

| Component | Props                                                      | What                                          |
| --------- | ---------------------------------------------------------- | --------------------------------------------- |
| `<Split>` | `horizontal` or `vertical`, `ratio?` (default 0.5), `gap?` | Container that divides space between children |
| `<Slab>`  | `name` (required)                                          | Renders the named slab's terminal             |

Nest them however you want. Layouts compose like any React tree.

### Sidebar

A React component for the left rail. Use `<Group>` for sections and
`<Item slab="...">` for click-to-focus buttons.

| Component | Props                                | What                                     |
| --------- | ------------------------------------ | ---------------------------------------- |
| `<Group>` | `title`                              | Labeled section                          |
| `<Item>`  | `slab` (required), `label?`, `icon?` | Click-to-focus slab link with status dot |

You can put anything else in your sidebar too. It's just React. Use
`useSlab(name)` to read state, `useFocus()` to control the active pane.

### Commands

Named CLI shortcuts runnable from the command palette or a CLI.
Optional.

```ts
// .rock/commands.ts
import { commands } from '@cluesurf/rock'

export default commands({
  deploy: { command: 'pnpm deploy', cwd: './ops' },
  migrate: { command: 'pnpm migrate', cwd: './base' },
})
```

## Boot configuration

Everything `boot()` accepts:

```ts
boot({
  name:        string                       // app name (Cmd+Tab, dock, menu)
  workspace:   Workspace                    // the workspace import

  icon?:       string                       // PNG/ICNS path for dock + about
  window?: {
    width?:        number                   // default 1400
    height?:       number                   // default 900
    title?:        string                   // default name
    background?:   string                   // default '#0b0d10'
    transparent?:  boolean
    titleBarStyle?: 'default' | 'hidden' | 'hiddenInset'
  }
  devtools?:   'auto' | 'always' | 'never'  // default 'auto'
  onReady?:    (app) => void | Promise<void>
  onClose?:    (app) => void | Promise<void>
})
```

The `app` handle (also returned from `boot()` and passed to `onReady`):

| Method                                      | What                           |
| ------------------------------------------- | ------------------------------ |
| `app.spawn(name, options?)`                 | Spawn a new slab dynamically   |
| `app.kill(name)`                            | Terminate a slab               |
| `app.restart(name)`                         | Re-spawn a slab                |
| `app.send(name, text)`                      | Write text into a slab's stdin |
| `app.read(name)`                            | Read scrollback contents       |
| `app.focus(name)`                           | Activate a slab                |
| `app.show()` / `app.hide()` / `app.close()` | Window control                 |
| `app.on(event, cb)`                         | Subscribe to lifecycle events  |

## Renderer-side hooks + actions

Inside any React component:

| Hook                  | Returns                                                     |
| --------------------- | ----------------------------------------------------------- |
| `useSlab(name)`       | `{ status, scrollback, pid, ... }`                          |
| `useWorkspace()`      | `{ name, slabs }`                                           |
| `useFocus()`          | `[focused, focus]`                                          |
| `useScrollback(name)` | string (live tail of slab output)                           |
| `useStatus(name)`     | `'idle' \| 'starting' \| 'running' \| 'exited' \| 'failed'` |

Imperative actions (callable from event handlers, effects):

| Function                | What            |
| ----------------------- | --------------- |
| `send(name, text)`      | Write to a slab |
| `spawn(name, options?)` | Spawn a slab    |
| `kill(name)`            | Kill a slab     |
| `restart(name)`         | Restart a slab  |
| `focus(name)`           | Activate a slab |

All imported from `@cluesurf/rock/face`.

## The full import map

| Where                         | What                                                               |
| ----------------------------- | ------------------------------------------------------------------ |
| `@cluesurf/rock`              | `workspace`, `commands`                                            |
| `@cluesurf/rock/boot`         | `boot`                                                             |
| `@cluesurf/rock/boot/preload` | side-effect import (no exports)                                    |
| `@cluesurf/rock/face`         | `mount`, `Shell`, `Split`, `Slab`, `Group`, `Item`, hooks, actions |
| `@cluesurf/rock/advanced`     | low-level primitives for power users                               |

Most apps use only the first four. You'll never touch `advanced` unless
you're building something exotic.

## Common recipes

### Run a slab on demand (not at startup)

Leave it out of the workspace map. Spawn at runtime:

```tsx
function DeployButton() {
  return (
    <button onClick={() => spawn('deploy', { command: 'pnpm deploy' })}>
      Deploy
    </button>
  )
}
```

### Send keystrokes into a slab from a button

```tsx
<button onClick={() => send('shell', 'ls -la\n')}>List files</button>
```

### Tabbed slabs (focus one at a time, hide others)

```tsx
function TabbedView() {
  const [focused, focus] = useFocus()
  return (
    <>
      <nav>
        <button onClick={() => focus('web')}>Web</button>
        <button onClick={() => focus('api')}>API</button>
      </nav>
      <main>
        <Slab name={focused} />
      </main>
    </>
  )
}
```

### Show slab output as plain text (no terminal renderer)

```tsx
function PlainOutput({ slab }: { slab: string }) {
  const text = useScrollback(slab)
  return <pre>{text}</pre>
}
```

### React to slab exit

```tsx
function HealthBanner() {
  const status = useStatus('api')
  return status === 'exited' ? (
    <div className="alert">API exited!</div>
  ) : null
}
```

### Mix rock with non-rock UI

Rock components are React, so anywhere in any React tree:

```tsx
function Dashboard() {
  return (
    <div className="grid grid-cols-2">
      <div>{/* your own stats widgets */}</div>
      <Slab name="logs" />
    </div>
  )
}
```

## The folder layout

A typical rock app:

```
my-rock-app/
├── package.json
├── electron.vite.config.ts
├── .rock/
│   ├── workspace.ts        # the workspace
│   ├── layout.tsx          # how slabs are arranged
│   ├── sidebar.tsx         # the sidebar (optional)
│   └── commands.ts         # named commands (optional)
├── boot/
│   ├── main.ts             # boot Electron (3 lines)
│   └── preload.ts          # IPC bridge (1 line)
└── code/
    ├── index.html
    ├── app.tsx             # mount React (3 lines)
    └── style.css           # your CSS (optional)
```

The `.rock/` convention mirrors `.git/` and `.vscode/`. A project's
terminal config travels with the project.

## Mental flow during normal use

```
User runs `pnpm dev`
  ↓
electron-vite bundles main + preload + renderer
  ↓
Electron launches with your boot/main.ts
  ↓
boot() reads workspace, spawns each slab's PTY, opens window
  ↓
Window loads, mount() renders your React tree
  ↓
<Slab name="web" /> connects to the PTY via IPC
  ↓
You see live terminals, click sidebar items to focus,
type into them like any terminal
```

## What rock handles for you

- PTY lifecycle (spawn / resize / kill)
- IPC bridge between Electron main and renderer
- xterm.js rendering of each slab
- Workspace state in a React store
- Session restore on reload
- macOS / Linux / Windows shell defaults
- Dev / prod URL switching
- Window lifecycle (close → kill slabs)
- DevTools auto-open in dev

You don't import `electron`, `node-pty`, `xterm.js`, or any IPC channel
names. Just `@cluesurf/rock/*`.

## What rock doesn't handle

- Window management (multi-window apps)
- Auth / cloud sync
- Plugin marketplace
- AI integration (you wire your own)
- Persistent SSH sessions (run `tmux` inside a slab)
- Mobile / web

For any of these, drop down to `@cluesurf/rock/advanced` or use a
different tool.

## Quick troubleshooting

| Symptom                  | Likely cause                                          | Fix                                                     |
| ------------------------ | ----------------------------------------------------- | ------------------------------------------------------- |
| Black main area          | Renderer crash on mount                               | Check DevTools console                                  |
| "posix_spawnp failed"    | `spawn-helper` missing execute bit (pnpm install bug) | `pnpm fix-spawn-helper`                                 |
| Cmd+Tab shows "Electron" | App name not set                                      | Pass `name: 'YourApp'` to `boot()`                      |
| Slab shows "not found"   | Wrong symbolic name                                   | Match `<Slab name="X">` to workspace map key            |
| Slabs spawn but blank    | Command exits immediately                             | Check `command` is long-running, or run `tail -f` style |

## Next steps

- Build a custom sidebar with your own widgets (use hooks).
- Add a command palette using `commands()` + a custom modal.
- Persist slab output to disk (subscribe to `app.on('slab')`).
- Style with Tailwind / your own CSS — rock components use inline styles
  so they don't impose a styling system.

## Related

- The full design: `../../note/library/rock/api-design.md` (internal,
  link if you're contributing)
- Positioning: `rock-positioning.md`
- Terminal landscape: `terminal-landscape.md`
- What it takes to build from scratch: `terminal-from-scratch.md`

# Rock concepts (deep dive)

Why rock works the way it does. The mental model, the
two-process architecture, what slabs actually are, what
you can and can't do.

Read after `quickstart.md` if you want to understand
WHY, not just HOW.

---

## Why this isn't "just a React app"

A normal browser React app can:
- Render UI
- Make HTTP requests
- Use localStorage
- Talk to APIs

It CANNOT:
- Spawn an OS process (like `pnpm dev` or `zsh`)
- Read your local filesystem
- Open a network port
- Run `node-pty`

A terminal needs all those things. So rock can't just be a
browser app. It needs **Node.js access**.

Electron is how you get React UI + Node.js capabilities
in one app:

```
Electron app
├── Main process       (Node.js, spawns processes, no DOM)
└── Renderer process   (Chromium + DOM, runs your React, no Node)
```

These are **two separate OS processes** communicating via
IPC (inter-process communication).

Rock lives in both:
- Main: spawns the actual PTYs (terminal processes)
- Renderer: shows them via xterm.js + React

If you've used Next.js or Remix, the mental model is
similar:

| Web framework | Electron |
|---|---|
| Server (Node, can read DB) | Main process |
| Client (browser, your React) | Renderer process |
| HTTP requests | IPC messages |
| WebSocket | Persistent IPC channel |

---

## Two processes, two contexts

You'll write code in both places. They have **different
capabilities**.

### Main process (Node.js)

Files: `boot/main.ts` (and anything imported from it).

Has:
- Full Node.js (`fs`, `path`, `child_process`, etc.)
- Can spawn `node-pty` PTYs
- Can read your `.rock/` config files
- Can open windows

Does NOT have:
- DOM
- React
- `window` global

### Renderer process (Chromium)

Files: `code/app.tsx` (and anything imported from it),
your `.rock/*.tsx` files.

Has:
- Full DOM
- React, hooks, your UI libraries
- `window` global
- xterm.js (visual terminal)

Does NOT have:
- Node.js APIs
- Direct access to `node-pty` or `fs`
- Ability to spawn processes

### The bridge

The renderer talks to main via a **preload** (`boot/preload.ts`).
The preload runs in the renderer's context but has limited
Node access. It exposes a safe API to your React code via
`window.app`.

You don't usually write IPC code directly. Rock wraps it
so you just call `send('web', 'ls\n')` or `useSlab('web')`
and the IPC happens behind the scenes.

---

## What a slab actually is

A **slab** is a long-lived OS process (typically a shell
like zsh running a command) attached to a virtual terminal
(PTY).

```
┌─────────────────────────────────────────────────────────┐
│ MAIN process                                            │
│                                                         │
│  manager spawns:                                        │
│    node-pty → /bin/zsh "pnpm dev"                       │
│                  ↓                                      │
│              PTY pipes                                  │
│                  ↓                                      │
│  manager listens for stdout                             │
│  manager sends to renderer via IPC                      │
└─────────────────────────────────────────────────────────┘
                       ↕ IPC
┌─────────────────────────────────────────────────────────┐
│ RENDERER process                                        │
│                                                         │
│  <Slab name="web" />                                    │
│    → looks up 'web' in slabIdByName map                 │
│    → mounts an xterm.js instance                        │
│    → subscribes to incoming PTY data via IPC            │
│    → renders ANSI escape sequences as styled text       │
│    → user keystrokes → IPC → manager → PTY → process    │
└─────────────────────────────────────────────────────────┘
```

So a slab is:
- An OS process (with a PID, taking CPU, eating memory)
- Connected to a PTY (so it sees colors, cursor, etc.)
- Bridged to the renderer via IPC
- Visualized by xterm.js inside a React component

When you write `<Slab name="web" />` in React, you're not
creating the process. The process was already spawned at
boot. You're saying "render a terminal that's connected to
the existing 'web' slab".

---

## `<Slab>` is regular React (with hidden complexity)

`<Slab name="web" />` is a normal React component. You can:
- Place it anywhere in your tree
- Style its container with CSS
- Wrap it, nest it, conditionally render it
- Render multiple `<Slab>` components in parallel

What's hidden:
- It looks up 'web' in the slab-id map (auto-populated at boot)
- It instantiates xterm.js (a JS terminal renderer)
- It subscribes to IPC events for that slab's output
- It writes keystrokes back via IPC

What you can NOT do:
- Render the same slab in two places at once (one PTY = one
  xterm; the second one would not get the cursor state)
- Detach a slab and re-attach it without losing scrollback
  (xterm scrollback dies with the component instance)

---

## Why an `app` handle (returned by `boot()`)

The MAIN process can also drive slabs. Examples:
- "When the file watcher fires, restart the 'api' slab"
- "When the user closes a system tray menu item, kill the
  related slab"
- "When an HTTP webhook arrives, spawn a slab to handle it"

For these, the renderer isn't involved. You need a Main-
process API. That's the `app` handle:

```ts
// boot/main.ts
import { boot } from '@cluesurf/rock/boot'

const app = await boot({ name: 'Rock', workspace })

watcher.on('change', () => app.restart('api'))
tray.on('rebuild', () => app.spawn('build', { command: 'pnpm build' }))
```

In the RENDERER, you use **hooks and imperative actions**
instead:

```tsx
import { useStatus, send, restart } from '@cluesurf/rock/face'

function RestartButton() {
  return <button onClick={() => restart('api')}>Restart API</button>
}
```

Same underlying state. Two faces (Main + Renderer) because
they're separate processes.

---

## The slab options explained

```ts
{
  command:    string                  // "pnpm dev"
  cwd?:       string                  // "./site"
  args?:      string[]                // extra arg list
  env?:       Record<string, string>  // env vars
  scrollback?: number                 // line buffer cap
  title?:     string                  // display title
}
```

### `command`

The string to run. Behind the scenes rock spawns your
default user program (zsh on macOS, bash on Linux,
powershell on Windows) and pipes the command into it.

So `command: 'pnpm dev'` is equivalent to typing `pnpm dev`
into a fresh zsh session.

If you want a different interpreter, embed it in the
command: `command: 'fish -c "pnpm dev"'`.

### `cwd`

Working directory. The process is spawned with this as its
current directory.

- Relative paths resolve against the workspace `root` (or
  the project root if not set).
- `~` expands to home dir.
- Absolute paths are used as-is.

### `args`

Extra arguments passed to the interpreter, not the command.
99% of the time you can ignore this. Use it for things like
`args: ['-l']` to spawn a login program.

### `env`

OS environment variables for this slab's process. Real
shell programs inherit env from the parent. By default
that's whatever Electron was launched with. You can:
- Add new vars: `env: { API_KEY: 'sk-xxx' }`
- Override existing: `env: { NODE_ENV: 'production' }`
- Hide system vars: not directly supported; set them to
  empty string

You'd want this when:
- A slab needs a different `NODE_ENV` than the rest
- A slab needs a secret token loaded from a `.env`
- Slabs need different `PATH` (e.g., per-project nvm)

Workspace-level `env` applies to every slab. Slab-level
`env` merges on top.

### `scrollback`

How many lines of output to keep in memory for back-scroll.
Default 50,000. Increase for log-heavy slabs. Decrease for
low-memory environments.

### `title`

Display name when something asks for it (e.g., in the
window title when the slab is focused). Default: the slab
map key.

---

## What you CAN do

| Goal | How |
|---|---|
| Render one terminal full-window | `<Slab name="term" />` inside a div with `100vh` |
| Render multiple terminals side by side | Multiple `<Slab>` in a flex container, or use `<Split>` |
| Custom layout (tabs, grid, floating) | Whatever React/CSS you want around `<Slab>` components |
| Sidebar with click-to-focus | Plain `<button onClick={() => focus(name)}>` |
| Spawn a slab on a button click | `spawn('build', { command: 'pnpm build' })` |
| Send keystrokes to a slab | `send('term', 'ls -la\n')` |
| Show slab output as plain text (no terminal renderer) | `const text = useScrollback('term'); return <pre>{text}</pre>` |
| React to slab exit | `const status = useStatus('api'); if (status === 'exited') {...}` |
| Mix rock with non-rock UI | Place `<Slab>` inside any other React tree |
| Use Tailwind, Radix, shadcn, etc. | Freely. Rock components use inline styles, no global CSS conflicts. |
| Custom themes | Style the parent div; xterm has its own theme prop (advanced) |
| Multiple workspaces | One at a time per window; advanced for multi-workspace |
| Drag to resize splits | `<Split>` has built-in drag handles |
| Listen to events from Main process | `app.on('slab', cb)` in your boot/main.ts |

---

## What you CAN'T do

| Goal | Why not | Workaround |
|---|---|---|
| Run rock in a regular browser | Browsers can't spawn processes | Build a "web terminal" with a server (out of scope) |
| Import `node-pty` in app.tsx | Renderer has no Node access (context isolation) | Use rock's hooks/actions instead |
| Spawn a slab from the renderer without going through IPC | All process spawns happen in Main | `spawn('name', ...)` from face does the IPC for you |
| Render the same slab in two places | xterm.js binds to one DOM node; second mount would race | Render only once, or accept the visual splits will be inconsistent |
| Persist live process memory across reboots | A shell program isn't serializable | Slabs re-spawn on restart; commands re-run |
| Have a slab survive the window closing | Rock kills slabs on window close (no daemon) | Run `tmux` inside a slab if you need persistence |
| Get the Cmd+Tab name to say "Rock" in dev mode | macOS shows the binary's bundle name (Electron in `electron-vite preview`) | Package via electron-builder for a real "Rock.app" |
| Make slab keystrokes streaming faster than ~5ms | Renderer-Main IPC has overhead | Inherent to Electron; use native terminals for sub-ms latency |
| One slab spread across two windows | Each window has its own renderer | Render a "remote control" UI in window 2 using hooks |

---

## Common confusion FAQ

### "Why can't I just `import { spawn } from 'node:child_process'` in my React?"

Because the renderer is locked down. `contextIsolation: true`
and `nodeIntegration: false` mean Node.js APIs are NOT
accessible from your React code. This is a security model
to prevent XSS becoming RCE (remote code execution).

The preload bridges only specific safe operations. Rock
exposes those as hooks/actions.

### "What's the difference between a slab and a tab?"

A **slab** is a process. A **tab** is a UI element. Rock
gives you slabs and leaves the UI to you. If you want
horizontal tabs at the top, write them. If you want a
sidebar, write that. If you want a grid of mini-terminals,
write that.

Slab = backend reality. Tab = your visual choice.

### "Can I have two slabs running the same command?"

Yes. Each entry in the workspace map is a separate process.

```ts
slabs: {
  web1: { command: 'pnpm dev --port 3000' },
  web2: { command: 'pnpm dev --port 3001' },
}
```

Two PIDs, two PTYs, two xterm renderers.

### "Is slab IPC bidirectional?"

Yes. You type → keystroke → IPC → main → PTY → process.
Process outputs → PTY → main → IPC → renderer → xterm.

Same channel both directions, just different events.

### "Can I use rock without Electron?"

Not currently. Rock is designed for Electron. There's no
fundamental reason it couldn't target Tauri or a custom
web+server setup, but that's out of scope for v1.

### "Does each slab take a lot of memory?"

A bare zsh process: 5-10 MB. With xterm.js renderer +
React component: another 2-5 MB on the renderer side. For
10 slabs you're looking at ~100 MB of process memory total.
Not a concern for normal usage.

### "Why does the window go black if I refresh DevTools?"

Refreshing the renderer kills the React tree. Slabs in
Main are still alive but the React subscriptions are gone.
On reload, components remount but no slab data flows until
the slab-map IPC fires again. Currently rock doesn't auto-
recover from renderer hot-reload (planned: see
`note/library/rock/hot-reload-design.md` for the proposal).

### "Why xterm.js and not a custom terminal renderer?"

Because writing a correct terminal renderer takes years.
xterm.js is mature (powers VSCode's terminal), covers ~95%
of terminal protocols correctly, and has a plugin ecosystem.
The 5% gap (sixel images, exotic Kitty protocols) doesn't
affect 99% of users.

### "Why React and not Vue / Svelte / Solid?"

Pragmatic choice. React has the biggest TypeScript
ecosystem and the most Electron desktop apps built on it
(VSCode, Hyper, Wave, Tabby). Rock could in theory expose
a framework-agnostic core with React adapters; not v1.

### "Can I bundle this as a desktop app and ship it?"

Yes, via `electron-builder`. Add to `package.json`:
```json
"scripts": {
  "package": "electron-vite build && electron-builder --mac"
}
```
Then `pnpm package` produces a `Rock.app` you can
distribute (and which has its own name/icon, not Electron's).

### "Why does my slab show `posix_spawnp failed`?"

pnpm's tarball extraction sometimes drops execute bits on
`node-pty/prebuilds/*/spawn-helper`. Fix:
```bash
pnpm fix-spawn-helper
```
Already wired into `predev` / `prestart`.

---

## The mental shortcut

If you understand:

```
React app in a browser
  + a Node server
  + bidirectional WebSockets
  + "slabs" are running OS processes you stream
```

…you understand rock. It's the same shape as a modern
fullstack web app, except the "server" is the Electron Main
process and the "WebSocket" is Electron's IPC.

You write React for the renderer. You write Node code for
Main. They communicate. Rock makes that connection
automatic for terminal processes.

---

## Related

- Public quickstart (HOW): `quickstart.md`
- Why this stack vs alternatives: `rock-positioning.md`
- The terminal ecosystem: `terminal-landscape.md`
- What it takes to build a terminal: `terminal-from-scratch.md`

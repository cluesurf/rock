# Rock's use-case

What `@cluesurf/rock` is. What it isn't. What shoulders it stands on.

Companions:

- `terminal-landscape.md` (the full ecosystem)
- `terminal-from-scratch.md` (why building is hard)

---

## What Rock is

Rock is **a thin TypeScript library** for building Electron-based
terminal workspace apps.

It wraps the parts that are solved (PTY lifecycle, ANSI rendering, IPC,
session persistence) so you spend your time on what isn't: the workspace
UX, custom layouts, custom sidebars, custom commands.

A workspace is a named map of slabs. Layouts are JSX. Sidebars are JSX.
You write a `.rock/` folder, mount the library's React components, and
ship.

---

## What Rock is NOT

| Claim                                          | Reality                                                    |
| ---------------------------------------------- | ---------------------------------------------------------- |
| A terminal emulator                            | No. It uses xterm.js for rendering.                        |
| A multiplexer                                  | No. It spawns one PTY per slab, no daemon.                 |
| Cross-platform competitor to WezTerm / Ghostty | No. It's an Electron app for now.                          |
| GPU-accelerated                                | No. xterm.js is DOM-based.                                 |
| Multi-year systems work                        | No. The library is small (~1000 lines TypeScript).         |
| A framework                                    | Aspires NOT to be. The v1 surface is intentionally narrow. |

If you want a terminal emulator: use Ghostty, Kitty, WezTerm, or iTerm2.

If you want a multiplexer: use tmux or zellij.

If you want to **build your own workspace app on top of solved
primitives**: Rock.

---

## The common case Rock makes easy

```
"I want a terminal app for MY workflows.
 My sidebar, my layout, my commands.
 Written in TypeScript and React,
 not someone else's plugin API."
```

That used to mean assembling Electron + xterm.js + node-pty + React +
IPC plumbing yourself. Days of boring work before you write the first
line of business logic.

Rock collapses that into:

```ts
// boot/main.ts (~10 lines)
const manager = new TerminalManager({ emit })
wireTerminalMain({ manager })

// boot/preload.ts (1 line)
exposeTerminalApi()

// .rock/workspace.ts
defineWorkspace({ name, slabs: { web, api, logs } })

// .rock/layout.tsx
<Split horizontal><Slab name="web" /><Slab name="api" /></Split>

// .rock/sidebar.tsx
<SidebarSection title="App"><SlabButton name="web" /></SidebarSection>
```

That's a terminal workspace app.

---

## The trade-offs Rock made

Honest list.

### Electron, not Tauri or native

| Trade                           | Why                                                     |
| ------------------------------- | ------------------------------------------------------- |
| 200-600 MB RAM at idle          | Acceptable for personal workspaces.                     |
| ~3ms input latency              | Imperceptible to most users.                            |
| Slow heavy-throughput rendering | If you `cargo build` constantly, use Ghostty.           |
| Big binary (~150 MB)            | Acceptable for desktop apps in 2026.                    |
| In exchange:                    | Full node-pty support, mature ecosystem, fast iteration |

See `note/idea/electron-vs-tauri.md` for the full comparison.

### xterm.js, not a native GPU renderer

| Trade                            | Why                                                                              |
| -------------------------------- | -------------------------------------------------------------------------------- |
| ~95% protocol coverage (not 99%) | Edge cases in sixel, exotic TUIs.                                                |
| ~10-30k updates/sec ceiling      | Below native GPU renderers.                                                      |
| DOM-based, more CPU per frame    | Acceptable for typical workflows.                                                |
| In exchange:                     | Cross-platform, TypeScript-native, huge ecosystem, plugin compatible with VSCode |

If you live in sixel image protocols or run things that push 100k+
updates per second, this is the wrong tool.

### node-pty, not custom PTY

| Trade                                    | Why                                             |
| ---------------------------------------- | ----------------------------------------------- |
| Native dep, needs rebuild for Electron   | One-time install pain.                          |
| Same on every OS, but with subtle quirks | Better than rolling your own.                   |
| In exchange:                             | Battle-tested across VSCode, Hyper, Wave, Tabby |

### One PTY per slab, no multiplexing daemon

| Trade                              | Why                                                            |
| ---------------------------------- | -------------------------------------------------------------- |
| Slabs die when app dies            | Re-spawn via workspace restore.                                |
| No "detach and reconnect tomorrow" | Use tmux inside a slab if you need that.                       |
| No SSH session persistence         | Use `wezterm ssh` or mosh.                                     |
| In exchange:                       | No daemon to manage, no orphan processes, simpler mental model |

If you need persistent sessions: run `tmux` INSIDE a Rock slab. Rock
won't get in the way.

### Workspace, not graph

| Trade                                            | Why                                                      |
| ------------------------------------------------ | -------------------------------------------------------- |
| No plugins API in v1 surface                     | Easier to learn, faster to ship.                         |
| No auto-discovery (pnpm / docker / k8s scanning) | Phase 2 if useful.                                       |
| No AI integration                                | You can add it in your `.rock/` JSX.                     |
| In exchange:                                     | Simple mental model: workspace → slabs → JSX. That's it. |

The maximal vision exists (see `note/idea/rock-workspace-os-vision.md`),
but it's explicitly deferred. v1 prefers shipping over abstraction
purity.

### TypeScript, not Lua / Python / KDL

| Trade                                | Why                                                  |
| ------------------------------------ | ---------------------------------------------------- |
| Locked to TS ecosystem               | Most modern app devs already there.                  |
| Doesn't appeal to vim-config writers | They have WezTerm and Kitty.                         |
| In exchange:                         | React composability, npm package access, type safety |

---

## The tools Rock wraps

Standing on the shoulders of giants. Every one of these is a
deeply-engineered, decade-mature project. Rock just composes them.

| Tool                       | License  | What it does for Rock                       | Why it's the right pick                                                                  |
| -------------------------- | -------- | ------------------------------------------- | ---------------------------------------------------------------------------------------- |
| **Electron**               | MIT      | Desktop window shell, Node + Chrome runtime | Best DX for Node + web stack on desktop. Mature for ~10 years.                           |
| **xterm.js**               | MIT      | ANSI parsing + character rendering          | Powers VSCode's terminal. ~95% protocol coverage. Plugin ecosystem (fit, links, search). |
| **@xterm/addon-fit**       | MIT      | Auto-resize terminal to container           | Standard xterm.js companion.                                                             |
| **@xterm/addon-web-links** | MIT      | Clickable URLs in scrollback                | Standard.                                                                                |
| **@xterm/addon-search**    | MIT      | Search in scrollback                        | Standard.                                                                                |
| **node-pty**               | MIT      | Spawn shell processes with PTY support      | The TypeScript-PTY standard. Microsoft maintains it.                                     |
| **React**                  | MIT      | UI rendering                                | Universal, composable, what consumers already know.                                      |
| **Zustand**                | MIT      | State management                            | Tiny, no boilerplate, TypeScript-friendly.                                               |
| **better-sqlite3**         | MIT      | Local SQLite persistence                    | Synchronous SQLite, perfect for desktop workspace storage.                               |
| **TypeScript**             | Apache 2 | Static types                                | Catches bugs at compile time, makes the API self-documenting.                            |

Optional consumer-side picks:

| Tool              | What it does                      | Why                                   |
| ----------------- | --------------------------------- | ------------------------------------- |
| **electron-vite** | Bundles main + preload + renderer | Standard 2024+ Electron + Vite setup. |
| **Vite**          | Renderer bundler                  | Fast HMR, modern.                     |
| **Tailwind v4**   | Renderer styling                  | CSS-first config, no JS toolchain.    |

---

## What Rock adds

The thin layer on top:

| Module                                           | Lines | Job                                            |
| ------------------------------------------------ | ----- | ---------------------------------------------- |
| `base/` (types, IPC protocol, workspace compile) | ~300  | Type-safe IPC contract                         |
| `node/terminal-manager.ts`                       | ~200  | Slab lifecycle (spawn / write / resize / kill) |
| `node/workspace-store.ts`                        | ~150  | SQLite persistence schema                      |
| `node/rock-folder.ts`                            | ~100  | `.rock/` folder loader                         |
| `react/` (components + store)                    | ~500  | JSX layout / sidebar / pane + Zustand store    |
| `electron/` (preload + main handler)             | ~100  | One-line bridge helpers                        |

**Total**: ~1500 lines of focused TypeScript. The rest is the giants
underneath.

---

## What you contribute

When you use Rock:

| You write                                     | Rock provides                                                   |
| --------------------------------------------- | --------------------------------------------------------------- |
| `.rock/workspace.ts` (your workspace + slabs) | `defineWorkspace` helper + compile                              |
| `.rock/layout.tsx` (your JSX layout)          | `<Split>` + `<Slab>` components                                 |
| `.rock/sidebar.tsx` (your JSX sidebar)        | `<SidebarSection>` + `<SlabButton>`                             |
| `.rock/commands.ts` (your commands)           | `defineCommands` helper                                         |
| `boot/main.ts` (Electron app entry)           | `TerminalManager` + `wireTerminalMain`                          |
| `boot/preload.ts` (IPC bridge)                | `exposeTerminalApi` (one line)                                  |
| `code/app.tsx` (your React root)              | `<TerminalApiProvider>`, `<TerminalEvents>`, `useTerminalStore` |

You write the workspace UX. Rock handles everything underneath.

---

## When NOT to use Rock

Honest exclusions:

- **You want a fast everyday terminal app.** Use Ghostty / WezTerm /
  Kitty. Rock is for building workflow-specific apps, not for
  general-purpose shell work.

- **You care about sub-millisecond input latency or 100k+ updates/sec.**
  Use a native GPU terminal. xterm.js + Electron won't get there.

- **You need persistent sessions across reboots.** Run tmux inside a
  Rock slab, or use a real multiplexer as your primary terminal.

- **You want plugins from a marketplace.** Rock has no plugin
  marketplace. Wave, Tabby, Warp do.

- **You want SSH session resilience.** Use mosh or `wezterm ssh`. Rock
  doesn't try to solve this.

- **You don't write TypeScript / React.** Rock is TypeScript-native. Lua
  scripters should use WezTerm; Python scripters should use Kitty.

---

## When to use Rock

| Scenario                                                    | Why Rock fits                                           |
| ----------------------------------------------------------- | ------------------------------------------------------- |
| "I want a custom terminal for my dev workflow"              | Sidebar + layout + commands in JSX. Done in an evening. |
| "I want a control panel for my long-running services"       | Spawn each as a slab, label them, click to focus.       |
| "I want an AI-aware code terminal"                          | Add your AI client as a React component in `.rock/`.    |
| "I want a terminal for a band / studio workflow"            | Spawn mixer / DAW CLI / monitoring scripts as slabs.    |
| "I'm building a niche dev tool that ships as a desktop app" | Rock is your Electron + terminal + UI starter.          |

---

## The honest sentence

Rock is a small library that turns a familiar Electron + React +
TypeScript stack into a programmable terminal workspace. It is built on
proven primitives (xterm.js, node-pty, Electron, React) and adds the
connective tissue (typed IPC, slab lifecycle, JSX layout / sidebar
components, SQLite persistence) so you can ship a custom terminal app in
days, not months.

Everything Rock does well is because someone else solved the hard part
first. Rock just makes the common case easy.

---

## Related

- The ecosystem: `terminal-landscape.md`
- Why building is hard: `terminal-from-scratch.md`
- Library readme: `../readme.md`
- Architecture rationale: `note/idea/terminal-emulator.md` (in
  cluesurf/note/)
- The maximal vision: `note/idea/rock-workspace-os-vision.md`
- The simplicity directive: `note/idea/rock-v1-simplicity.md`

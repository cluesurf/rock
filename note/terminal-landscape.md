# The modern terminal landscape (2026 cheatsheet)

A complete map of terminal emulators, multiplexers, renderers, and
workspace systems available today. Tables every section for quick
scanning.

## The big picture

A "terminal" today is really three concerns stacked:

```
1. PTY layer        spawns the shell (node-pty, ConPTY, openpty)
2. Renderer         interprets ANSI + draws characters (GPU or web)
3. Workspace layer  tabs, panes, sessions, sidebar (tmux, zellij, your UI)
```

Each layer has multiple options. Most products bundle their own picks. A
few products are JUST one layer.

## Tier 1: native GPU renderers

The fastest, lowest-latency, lowest-RAM terminals. Built in Rust, Zig,
or C++. No web runtime.

| Terminal      | Language      | Multiplexing                       | Scripting        | macOS | Linux         | Windows | Cost |
| ------------- | ------------- | ---------------------------------- | ---------------- | ----- | ------------- | ------- | ---- |
| **Ghostty**   | Zig           | None (use tmux/zellij)             | Config file      | yes   | yes           | no      | free |
| **Alacritty** | Rust          | None                               | YAML / TOML      | yes   | yes           | yes     | free |
| **Kitty**     | C / Python    | Built-in (kitty-style tabs/splits) | Python (kittens) | yes   | yes           | no      | free |
| **WezTerm**   | Rust          | Built-in (mux server)              | **Lua** + CLI    | yes   | yes           | yes     | free |
| **foot**      | C             | None                               | INI              | no    | yes (Wayland) | no      | free |
| **Rio**       | Rust (WebGPU) | Some                               | TOML             | yes   | yes           | yes     | free |

**Pick if**: you care about input latency, RAM footprint,
vim/neovim/htop responsiveness, and you're okay with horizontal tabs
only.

**Strongest combo**: WezTerm (Lua scripting + CLI) + zellij
(multiplexer). Or Ghostty + tmux.

## Tier 2: hybrid native + UI

Built native but with richer UI affordances.

| Terminal             | Language           | Tab UI                                | Renderer              | Scripting            | Cost               |
| -------------------- | ------------------ | ------------------------------------- | --------------------- | -------------------- | ------------------ |
| **iTerm2**           | Objective-C        | Horizontal tabs + native macOS chrome | CoreGraphics          | AppleScript + Python | free               |
| **Warp**             | Rust (web-tech UI) | Block-based (commands as cards)       | Metal                 | (closed)             | free + paid tiers  |
| **Konsole**          | C++ (Qt)           | Horizontal + tabs                     | Qt                    | KDE bindings         | free               |
| **Windows Terminal** | C++                | Horizontal tabs                       | DirectWrite + DirectX | JSON config          | free               |
| **Terminal.app**     | Objective-C        | Tabs                                  | Core Text             | AppleScript          | bundled with macOS |

**Pick if**: you want a polished native app on one platform, don't need
cross-platform scripting.

## Tier 3: Electron-based modern terminals

Web rendering (xterm.js or similar) wrapped in Electron. Heavier but
feature-rich.

| Terminal                           | Language              | Tab UI                                                            | Plugin model       | AI        | RAM (idle) |
| ---------------------------------- | --------------------- | ----------------------------------------------------------------- | ------------------ | --------- | ---------- |
| **Wave Terminal**                  | TS/React (Electron)   | **Left tree** + blocks (terminal / browser / AI / editor / files) | TypeScript widgets | built-in  | 300-600 MB |
| **Tabby**                          | TS/React (Electron)   | **Left tree** + tabs                                              | TypeScript plugins | extension | 250-500 MB |
| **Hyper**                          | TS/React (Electron)   | Horizontal tabs                                                   | TypeScript plugins | extension | 200-400 MB |
| **Fig** (now Amazon CodeWhisperer) | TS (Electron overlay) | Floating autocomplete                                             | TypeScript         | yes       | 150 MB     |

**Pick if**: you want left-sidebar trees, mixed- content blocks,
TypeScript-native plugins, or AI features baked in.

## Multiplexers (the workspace layer)

Persistent sessions, panes, tabs that survive disconnects. Run inside
ANY terminal.

| Multiplexer | Language | Config                    | Sessions          | Layout files        | Plugins       |
| ----------- | -------- | ------------------------- | ----------------- | ------------------- | ------------- |
| **tmux**    | C        | Custom DSL (`.tmux.conf`) | yes               | scripted            | TPM ecosystem |
| **zellij**  | Rust     | **KDL**                   | yes               | **KDL declarative** | WASM plugins  |
| **screen**  | C        | Minimal                   | yes               | none                | none          |
| **dvtm**    | C        | Source recompile          | no                | none                | none          |
| **abduco**  | C        | None                      | yes (detach only) | none                | none          |

**zellij vs tmux**:

- zellij is more modern (sessions / tabs / panes / layouts as
  first-class concepts, declarative KDL config, WASM plugins).
- tmux is more proven (decades old, every server has it, enormous
  community config / plugin knowledge).

**Pick zellij**: new project, you like declarative config, you'll script
layouts.

**Pick tmux**: SSH-heavy workflow, lots of remote servers, mature plugin
ecosystem.

## Underlying renderer technologies

What actually paints text on screen.

| Renderer                        | Used by                            | GPU      | Coverage | Notes                                          |
| ------------------------------- | ---------------------------------- | -------- | -------- | ---------------------------------------------- |
| **xterm.js**                    | VSCode, Hyper, Wave, Tabby, Rock   | no (DOM) | ~95%     | Most TypeScript-friendly. ~10-30k updates/sec. |
| **Metal/Vulkan/DirectX direct** | Alacritty, Kitty, Ghostty, WezTerm | yes      | ~99%     | Native max performance. 100k+ updates/sec.     |
| **CoreGraphics**                | iTerm2                             | partial  | ~99%     | macOS-native rendering.                        |
| **DirectWrite**                 | Windows Terminal                   | yes      | ~99%     | Windows-native rendering.                      |
| **Qt**                          | Konsole                            | partial  | ~95%     | Cross-platform via Qt.                         |

**Trade-off**: native GPU renderers win on performance + protocol
correctness. Web renderers win on programmability + ecosystem reuse +
cross- platform UI sharing.

## PTY layer (the actual shell process)

What spawns the shell and pipes data in/out.

| PTY library           | Used by                          | Language            | Platform                   |
| --------------------- | -------------------------------- | ------------------- | -------------------------- |
| **node-pty**          | VSCode, Hyper, Wave, Tabby, Rock | TS (native binding) | mac / linux / win (ConPTY) |
| **portable-pty**      | WezTerm                          | Rust                | all                        |
| **conhost / ConPTY**  | Windows Terminal                 | C++                 | win only                   |
| **openpty / forkpty** | POSIX standard                   | C                   | mac / linux                |
| **xterm-pty**         | (browser-only experiments)       | TS                  | browser (limited)          |

For any TypeScript-based terminal, `node-pty` is the de facto choice.

## Scripting / config language landscape

How users customize behavior.

| Terminal  | Config language                            | Strength                                       |
| --------- | ------------------------------------------ | ---------------------------------------------- |
| WezTerm   | **Lua**                                    | Real programming language, full API, callbacks |
| Kitty     | INI + Python                               | Python "kittens" extend behavior               |
| iTerm2    | AppleScript + Python                       | macOS automation                               |
| Alacritty | YAML / TOML                                | Simple, declarative                            |
| Ghostty   | Plain text config                          | Intentionally minimal                          |
| tmux      | Custom DSL                                 | Imperative `.tmux.conf`                        |
| zellij    | KDL                                        | Modern declarative, layouts as files           |
| Wave      | JSON                                       | Typed, schema-validated                        |
| Tabby     | TypeScript plugins                         | Full TS ecosystem                              |
| **Rock**  | **TypeScript** (JSX layouts + JSX sidebar) | Full TS ecosystem, React composability         |

## Left sidebar / tree tabs support

The feature people keep asking for.

| Terminal      | Left sidebar           | Tree tabs                 |
| ------------- | ---------------------- | ------------------------- |
| WezTerm       | no (build it yourself) | no                        |
| Ghostty       | no                     | no                        |
| Kitty         | no                     | no                        |
| iTerm2        | no                     | no                        |
| Alacritty     | no                     | no                        |
| Warp          | yes (sessions sidebar) | no                        |
| **Wave**      | **yes**                | **yes**                   |
| **Tabby**     | **yes**                | **yes**                   |
| Hyper         | extension-based        | extension-based           |
| tmux / zellij | no (TUI bars only)     | no                        |
| **Rock**      | **yes (JSX)**          | **yes (build it in JSX)** |

## AI integration

| Terminal            | AI features                                 | Provider           | Cost             |
| ------------------- | ------------------------------------------- | ------------------ | ---------------- |
| Warp                | Inline AI command suggestion, error explain | proprietary        | free tier + paid |
| Wave                | AI chat block, log summarization            | bring-your-own-key | free             |
| Fig / CodeWhisperer | Inline autocomplete                         | AWS                | free             |
| Tabby AI            | Inline assist (plugin)                      | OpenAI / local     | free             |
| Most others         | none built-in                               | —                  | —                |

If AI assist is a must-have: Warp or Wave.

## License and cost summary

| Terminal         | License             | Free?            | Account required? |
| ---------------- | ------------------- | ---------------- | ----------------- |
| WezTerm          | MIT                 | yes              | no                |
| Ghostty          | MIT                 | yes              | no                |
| Kitty            | GPL-3               | yes              | no                |
| Alacritty        | Apache              | yes              | no                |
| iTerm2           | GPL-2               | yes              | no                |
| Warp             | proprietary         | free tier        | **yes**           |
| Wave             | Apache 2            | yes              | optional          |
| Tabby            | MIT                 | yes              | no                |
| Hyper            | MIT                 | yes              | no                |
| Terminal.app     | proprietary (Apple) | yes (with macOS) | no                |
| Windows Terminal | MIT                 | yes              | no                |
| tmux             | BSD                 | yes              | no                |
| zellij           | MIT                 | yes              | no                |
| **Rock**         | **GPL-3-or-later**  | **yes**          | **no**            |

## Recommended combinations

The actual setups people run.

| Use case                                     | Best stack                                             |
| -------------------------------------------- | ------------------------------------------------------ |
| **Performance + Lua scripting**              | WezTerm + zellij                                       |
| **Performance + minimalism**                 | Ghostty + tmux                                         |
| **Performance + Python extensibility**       | Kitty alone (has built-in tabs)                        |
| **Native macOS feel**                        | iTerm2 + tmux                                          |
| **AI-assisted modern UX**                    | Warp                                                   |
| **TypeScript-native programmable workspace** | Wave or Tabby (or **Rock** if you want to build yours) |
| **Cross-platform corp dev box**              | Windows Terminal + tmux on WSL                         |
| **Server-side persistent sessions**          | tmux on the server, any client (WezTerm, etc.)         |

## The composability principle

Modern terminals split cleanly into:

```
renderer  (Ghostty, WezTerm, Alacritty, Kitty, xterm.js)
   +
workspace (tmux, zellij, Wave blocks, Rock JSX)
   +
shell     (zsh, fish, bash, nushell, xonsh)
```

Most innovation in 2024-2026 is in the **workspace layer**, not the
renderer. Renderers are largely a solved problem. Workspace UX,
programmability, sidebar trees, AI, blocks — that is where the
greenfield is.

This is why Rock exists. It's a workspace-layer library that uses
xterm.js + node-pty as the solved-problem parts.

## Where Rock fits

```
┌──────────────────────────────────────────┐
│  Rock                                    │
│    workspace layer (TypeScript, JSX)     │
│  ↓                                       │
│  xterm.js                                │
│    renderer (web, ~95% protocol)         │
│  ↓                                       │
│  node-pty                                │
│    PTY (cross-platform)                  │
│  ↓                                       │
│  zsh / bash / fish                       │
└──────────────────────────────────────────┘
```

Rock is NOT a competitor to WezTerm, Ghostty, or Wave. Rock is **the
workspace layer you'd build on top of them** if you wanted full
programmable control.

See `rock-positioning.md` for the explicit trade-offs.

## Quick recommendation matrix

| What you want                                 | Use                  |
| --------------------------------------------- | -------------------- |
| Fastest possible terminal                     | Ghostty or Alacritty |
| Programmable in Lua                           | WezTerm              |
| Built-in tabs + Python plugins                | Kitty                |
| Best macOS experience                         | iTerm2               |
| Left tree + AI + blocks                       | Wave or Warp         |
| TypeScript-native plugin system               | Tabby                |
| **Build your own workspace UI in TypeScript** | **Rock**             |
| Persistent server sessions                    | tmux                 |
| Modern declarative multiplexer                | zellij               |

## Related

- What it takes to build one from scratch: `terminal-from-scratch.md`
- How Rock positions: `rock-positioning.md`

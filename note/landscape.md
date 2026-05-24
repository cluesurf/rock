# The terminal landscape

What's out there, what each one optimizes for, and where **Rock** fits.

The terminal world has been quietly fragmenting for years. Three roughly
distinct layers, each with its own ecosystem of tools, and they don't
talk to each other cleanly.

```
┌────────────────────────────────┐
│  Workspace / orchestration     │  tmux, zellij, screen
├────────────────────────────────┤
│  Terminal emulator (renderer)  │  Ghostty, Alacritty, …
├────────────────────────────────┤
│  PTY + shell                   │  zsh, bash, fish + the OS
└────────────────────────────────┘
```

Most "terminal apps" focus on the middle layer. A few also try the top
layer. None of them are really meant to be hacked on by a JS person on a
weekend.

## Native renderers

GPU-accelerated, written in systems languages, built for **raw speed**
and **correct protocol handling**.

| Tool          | Language    | Vibe                                       |
| ------------- | ----------- | ------------------------------------------ |
| **Ghostty**   | Zig         | Newest, batteries-included, very fast      |
| **Alacritty** | Rust        | Minimal, config-only, no tabs/multiplexing |
| **Kitty**     | C + Python  | Scriptable via Python "kittens"            |
| **WezTerm**   | Rust + Lua  | Scriptable via Lua, built-in multiplexer   |
| **iTerm2**    | Objective-C | macOS-only, very feature-rich              |
| **Rio**       | Rust        | Newer GPU renderer                         |
| **Contour**   | C++         | Sixel + image protocol focused             |

**What they're good at**

- Microsecond keystroke latency
- Tens of thousands of redraws per second
- Correct Unicode, emoji, ligatures
- Truecolor, bracketed paste, OSC 8 hyperlinks
- Font shaping, ligatures, retina scaling

**What they're bad at**

- Extending the interface in any meaningful way
- Cross-platform parity (iTerm2 is macOS, Ghostty is still maturing on
  Windows, etc.)
- Anything that looks like a "workspace" (tabs, sure, but no project
  model, no scriptable sidebar, etc.)

## Multiplexers

The top layer. Daemons that own PTY sessions, draw their own UI, and
survive disconnects.

| Tool                  | Language | Vibe                                            |
| --------------------- | -------- | ----------------------------------------------- |
| **tmux**              | C        | The standard. Config = `.tmux.conf` + Lisp-ish  |
| **zellij**            | Rust     | tmux but with sane defaults and KDL layouts     |
| **screen**            | C        | The old one, mostly historical                  |
| **abduco** + **dvtm** | C        | Unix-philosophy split: session manager + tiling |

**What they're good at**

- Persistent sessions across SSH disconnect
- Tiled panes inside one terminal window
- Multi-client attach (pair programming, etc.)
- Scriptable layouts (`zellij --layout dev.kdl`)

**What they're bad at**

- Extending the _renderer_. You're stuck inside whatever emulator
  launched the multiplexer.
- Anything graphical. The UI is ASCII art forever.
- Custom interface. Want a tree sidebar with project groups? Not
  happening.

## Web / Electron terminals

Renderers built on **xterm.js** (the same canvas-based emulator VS Code
uses) and **node-pty** (Microsoft's PTY binding for Node).

| Tool                 | Stack                 | Vibe                                      |
| -------------------- | --------------------- | ----------------------------------------- |
| **VS Code terminal** | xterm.js + node-pty   | Embedded in the editor, not standalone    |
| **Hyper**            | Electron + React (JS) | Themeable via plugins, fairly old         |
| **Tabby**            | Electron + Angular    | Heavy, lots of features, opinionated      |
| **Warp**             | Rust GPU + TS UI      | Closed-source, AI-first, account required |
| **Wave**             | Electron + React      | Blocks-based, structured output           |

**What they're good at**

- Familiar web stack for the UI layer
- Themeable via CSS or JSON
- Easier cross-platform story (Electron handles it)
- Web devs can actually contribute

**What they're bad at**

- Performance: ~100-200 MB RAM at idle is the floor
- Startup time vs a native binary
- Most of them give you a fixed UI you can theme, not hack.
  **"Customizable" usually means colors + keymaps**.

## Tradeoff axes

Every terminal has to pick. None of them win on all axes simultaneously.

| Axis                | Winner(s)                     | Loser(s)               |
| ------------------- | ----------------------------- | ---------------------- |
| **Raw speed**       | Alacritty, Ghostty, Kitty     | Hyper, Tabby           |
| **Config-ability**  | Kitty, WezTerm                | Terminal.app           |
| **Scriptable**      | WezTerm (Lua), Kitty (Python) | iTerm2, Alacritty      |
| **Hackable UI**     | (none, honestly)              | All of them, basically |
| **Workspace model** | tmux, zellij                  | Every emulator alone   |
| **TS/JS native**    | Hyper (aging), Tabby          | Everything else        |

## The hackability gap

Look at that "hackable UI" row. Nobody's there.

WezTerm has Lua hooks. Kitty has Python kittens. Both are real but
**constrained** — you can spawn windows, react to events, draw overlays.
You cannot rewrite the sidebar in React, swap the tab strip for a tree,
or ship a custom command palette tied to your project's own data model.

The native tools weren't designed for that. Adding it would mean
exposing a UI runtime (Lua VM, Python embed) across every render path.
They've sensibly said no.

The Electron tools _could_ be that, but most went the plugin-system
route instead. Hyper has plugins. Tabby has plugins. **Plugin systems
are a worse experience than just writing the UI.** Every plugin API is a
narrower vocabulary than the thing it wraps.

## The TS/JS gap

The TypeScript / JavaScript world is enormous. Most working software
developers under 30 know it as their first or second language. Every
modern UI engineer lives in React.

What does that crowd have for terminals?

- VS Code's embedded terminal (not standalone)
- Hyper (last serious release: years ago)
- Tabby (Angular, heavy, opinionated)

That's it. There's no native-feeling **TypeScript terminal** where you
can drop a React component into the sidebar and ship it.

## Where Rock fits

Rock is squarely in the **Electron + xterm.js + node-pty** quadrant. So
it inherits:

- Idle RAM cost (~280 MB installed, ~110 MB zipped)
- Startup time that isn't sub-100ms
- Reliance on Chromium and Node

In exchange you get:

- **The entire UI is a React tree you author yourself.** Not a plugin
  API. Not Lua hooks. JSX components from `@cluesurf/rock/face` that you
  import and recompose.
- **Native TypeScript ergonomics.** Type your slabs, your layouts, your
  custom commands.
- **JIT-compiled customization** at `.rock/code/index.tsx`. Save the
  file, relaunch, your sidebar is different.
- **The same xterm.js engine VS Code uses**, so the protocol correctness
  story is solved.

```
                     hackable
                         ▲
                         │
                 [ROCK]  │
                         │
        WezTerm  Kitty   │
   Ghostty     Alacritty │       Hyper  Tabby
   ────────────────────────────────────────────▶ speed
                         │
                         │
                  tmux   │
                 zellij  │
```

Not the fastest. Not the leanest. Not the prettiest by default. But
**the one you can rewrite from inside your project**, in the language
you already use.

If you want bare metal speed, use Ghostty. If you want a multiplexer,
use zellij. If you want to build a custom workspace UI in TypeScript and
ship it as a Mac app, Rock is the only one that says yes.

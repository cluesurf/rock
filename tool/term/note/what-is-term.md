# What Term is

Term is a **hackable terminal workspace**. Like iTerm or
Wezterm, but the layout is yours — you write your sidebar
tree, layout React, command palette in a `.tool/term/code/`
folder next to your project. Term JIT-compiles it on
launch.

## Three things in one

1. **A terminal emulator.** xterm.js + node-pty in an
   Electron shell. Renders ANSI faithfully, handles
   clipboard, hyperlinks, font metrics. Themed (Dracula,
   One Dark, Solarized, Nord, Gruvbox, Monokai, Tokyo
   Night, Term Dark / Light). Bring your own as a plain
   object.

2. **A workspace manager.** Tabs (called "slabs") organized
   in a VSCode-style nested tree. Per-project state in
   `.tool/term/base.json` (committable) + `.tool/term/base.local.json`
   (per-machine). Window position, sidebar width, tab list,
   cwds — all restored on relaunch.

3. **A scriptable shell.** A `term` CLI ships with the app
   (installed by the Homebrew cask). `term`, `term open`,
   `term bind`, `term list`, `term send`, `term focus`,
   `term spawn`, `term kill`, `term doctor`. Talks to the
   running Term.app over a Unix-domain socket.

## Architecture in two paragraphs

The lib (`@cluesurf/term`) ships React components for every
piece of terminal chrome: `<Slab>`, `<Dock>`, `<TreeView>`,
`<Palette>`, `<Bar>`, `<Sheet>`, `<Toast>`, `<Keys>`,
plus the headless logic (workspace compilation, PTY
manager, IPC protocol, state store, theme + tree types).
The default Term.app is a thin "shell" that wires these up
into a sensible UI — sidebar tree, terminal pane, keyboard
shortcuts. You can replace any part of it from your
`.tool/term/code/index.tsx`.

The Electron main process runs `node-pty` PTYs and bridges
them to the renderer over IPC. A custom `term://` protocol
serves your JIT-compiled `.tool/term/code/` bundle. A second
Unix-socket IPC server lets the `term` CLI drive the
running app (list slabs, send keystrokes, spawn new tabs).
All persisted state lives in `.tool/term/` — there is no global
user-data directory.

## Where Term fits

You'll want Term if:

- You live in `tmux`, `wezterm`, or a heavily-customized
  terminal and find yourself wishing you could replace the
  sidebar / status bar with a React component.
- You manage many projects, each with their own
  `dev / api / logs / db` set of always-running shells, and
  want each project's layout to launch with one command.
- You write CLIs that integrate with terminals via
  custom escape codes, hyperlinks, OSC sequences and want
  an Electron-grade renderer to debug against.

You probably **don't** want Term if:

- You want a stock terminal with zero configuration.
  Use Apple Terminal, iTerm2, or Ghostty.
- You're on Windows or Linux first. Term works on those
  platforms but the macOS path is the most polished.
- You want a tmux replacement that survives across
  machines. Term's state is per-machine (no sync).

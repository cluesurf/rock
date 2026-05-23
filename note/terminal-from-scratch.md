# Building a terminal from scratch

What it actually takes. Why it's hard. The
trade-offs you can't avoid.

Companion to `terminal-landscape.md` (the existing
options) and `rock-positioning.md` (what Rock chose).

---

## The three layers

Every terminal has these:

```
1. PTY layer       (spawn shell, pipe stdin/stdout)
2. Rendering       (interpret ANSI escape codes, paint text)
3. Workspace UI    (tabs, panes, sessions, sidebar)
```

Difficulty:

| Layer | Difficulty | Why |
| ----- | ---------- | --- |
| PTY | **Easy** | node-pty solves it. ~50 lines. |
| Rendering | **Hard to very hard** | Decades of protocol accumulation. |
| Workspace UI | **Medium** | Ordinary app engineering. |

The first layer takes a weekend. The second takes
years. The third is where your ideas matter.

---

## The 10 hard problems of terminal rendering

These are what consume the years.

### 1. PTY multiplexing

A normal terminal:

```
1 shell ↕ 1 window
```

A real terminal (tmux / zellij / WezTerm mux):

```
many clients ↕ many virtual terminals ↕ many shells
```

Means:
- Multiple viewers attach to one shell
- Sessions survive disconnects
- Clients resize independently
- Panes redraw correctly per client

Requires:
- Virtual screen state per terminal
- Diff replay
- Client synchronization
- Output history buffering
- Resize reflow

**Years of work.**

### 2. Terminal emulation correctness

You must correctly implement:

| Standard | What |
| -------- | ---- |
| **ANSI / VT100** | Base escape codes (cursor, colors, scrolling) |
| **DEC modes** | Application keypad, bracketed paste, etc. |
| **OSC** (operating system commands) | Title, clipboard, hyperlinks |
| **SGR** (select graphic rendition) | Colors, bold, italic, underline |
| **Mouse tracking** | Click, drag, scroll reporting |
| **Bracketed paste** | Pasted text wrapped in markers |
| **Alternate screen buffer** | vim / less switch to a second buffer |
| **Unicode width** | Half-width / full-width characters |
| **Combining marks** | Diacritics applied to base characters |
| **Emoji clusters** | 👨‍👩‍👧‍👦 = 7 codepoints, 1 glyph |
| **Hyperlinks** (OSC 8) | Clickable URLs in scrollback |
| **Truecolor** (24-bit) | 16M colors instead of 256 |
| **Synchronized updates** (DECSET 2026) | Atomic redraw |

A single misinterpretation breaks:
- vim / neovim
- htop
- fzf
- lazygit
- any ncurses app

**Most of the year-multiplier.**

### 3. Resize semantics

Sounds trivial. It is not.

When the user drags the window from 80 cols to 120:

| Thing | Question |
| ----- | -------- |
| Wrapped lines | Re-flow to wider, preserving paragraph structure? |
| Cursor position | Shift relative to current row? |
| Scrollback | Re-wrap historical content? |
| Alternate screen buffer | Reset to fit, or preserve absolute positions? |
| ncurses apps | Need SIGWINCH, but timing matters |

tmux historically struggled with reflow. WezTerm
took years to get right. Wave / Tabby still have
edge cases.

### 4. Scrollback engine

You need:
- **Infinite history** (or configurable cap)
- **Efficient memory** (millions of lines without
  GB-RAM)
- **Fast redraw** (smooth scrolling)
- **Copy mode** (vim-style selection in history)
- **Search** (regex over scrollback)
- **Persistence** (history survives restart)

At scale, `tail -f huge.log` produces millions of
lines. Searching becomes a database problem.

### 5. Synchronization model

A real multiplexer is effectively:

```
real-time collaborative state system
```

You have:
- Server state (the truth)
- Pane state (per virtual terminal)
- Client state (what each viewer sees)
- Shell state (the underlying process)
- Terminal state (cursor, colors, modes)

All needing consistent synchronization. Example
gotcha: 2 attached clients with different window
sizes viewing the same shell. Whose width wins?
How do wraps render in each?

### 6. Rendering performance

Modern terminals push absurd throughput:

```
yes | pv > /dev/null
cargo build
make -j
```

Tens of thousands of updates per second. While
maintaining:
- Low latency (< 5ms)
- No tearing
- Low CPU
- Unicode shaping
- Font kerning + ligatures
- Image protocols (sixel, iTerm2, Kitty)

This becomes graphics engineering. GPU shaders.
Glyph atlases. Damage tracking.

### 7. Session persistence

A shell is not serializable. You cannot:

```
save bash → reload bash
```

So multiplexers instead:
- Keep processes alive forever (detach, not stop)
- Keep PTYs alive forever
- Reconnect clients later

Means:
- Daemon architecture
- IPC between daemon and clients
- Lifecycle management
- Orphan cleanup
- Zombie handling
- Signal forwarding (SIGINT through to children)

### 8. Platform hell

macOS, Linux, Windows differ enormously:

| Concern | macOS | Linux | Windows |
| ------- | ----- | ----- | ------- |
| PTY API | openpty | openpty | ConPTY (recent, quirky) |
| Signals | POSIX | POSIX | emulated badly |
| Unicode | NFC normalization | varies | UTF-16 internally |
| Clipboard | NSPasteboard | X11 / Wayland (different) | Win32 |
| IME | macOS-specific | varies by DE | Win32 |
| Keyboard input | Cocoa | X11 / Wayland | Win32 |

Windows historically was a disaster. ConPTY in
Windows 10 1809 made it tolerable. Still has
quirks.

### 9. Input semantics

Keyboard handling is wild.

| Modifier | macOS | Linux | Windows |
| -------- | ----- | ----- | ------- |
| Cmd | yes | no | no (Super) |
| Alt / Option | dual meaning | clean | clean |
| Meta | rare | escape-prefix | no |

Plus:
- Escape timing (vim's ESC vs Alt-key)
- Kitty keyboard protocol (full key reporting)
- CSI-u protocol (modern keyboard encoding)
- Application keypad mode
- Even `alt+backspace` is interpreted differently
  by different apps in different terminals

### 10. The long tail of weirdness

The real killer. You will spend years fixing:

```
neovim breaks when:
  resizing
  using emoji
  over ssh
  in tmux
  inside zellij
  with truecolor
  on Japanese IME
  after sleep wake
  on retina scaling
```

Thousands of edge cases. Each one a bug report.
Each one needs reproduction, isolation, fix,
regression test.

---

## The trade-offs

You cannot have everything. Pick your spots.

### Renderer

| Choice | Wins | Loses |
| ------ | ---- | ----- |
| **Native GPU** (Alacritty, Ghostty, WezTerm, Kitty) | Speed, latency, protocol fidelity | Years of work, single-platform-renderer challenges |
| **Web (xterm.js)** | Cross-platform UI, plugin ecosystem | ~95% protocol, slower throughput, higher RAM |
| **OS-native UI toolkit** (Qt, Cocoa) | Native feel | One-platform-at-a-time effort |

### Multiplexer

| Choice | Wins | Loses |
| ------ | ---- | ----- |
| **Build your own** | Tight integration | Years of work on the hardest problem |
| **Embed tmux/zellij** | Battle-tested | Coupling to external project, version drift |
| **Skip multiplexing** | Simple | No session persistence, no remote pairing |

### Persistence

| Choice | Wins | Loses |
| ------ | ---- | ----- |
| **Daemon + IPC** | True session restore | Lifecycle complexity, orphan processes |
| **Re-spawn commands** | Simple | Loses live shell state on restart |
| **None** | Simplest | Lose everything on restart |

### Plugin model

| Choice | Wins | Loses |
| ------ | ---- | ----- |
| **WASM** (zellij) | Sandboxed, language-agnostic | Plugin authors need WASM toolchain |
| **Language-specific** (Lua, Python, TS) | Easy for that language's users | One-language-at-a-time community |
| **CLI / IPC only** (WezTerm cli) | Any language can drive | Less integrated, no UI hooks |
| **None** | Simple | Users can't extend |

### Cross-platform vs single-platform

| Choice | Wins | Loses |
| ------ | ---- | ----- |
| **Cross-platform** (web stack) | Bigger market | Performance ceiling, native-feel hit |
| **macOS-only** (iTerm2) | Polished native | Locked out of Linux + Windows |
| **POSIX-only** | Most of the dev market | Windows users excluded |

### Performance vs features

| Choice | Wins | Loses |
| ------ | ---- | ----- |
| **Performance-first** (Alacritty, Ghostty) | Latency, RAM | No tabs, no plugins, no UI |
| **Feature-first** (Wave, Warp) | Blocks, AI, sidebar | Higher RAM, slower throughput |
| **Balanced** (WezTerm, Kitty) | Both, somewhat | Compromises in both directions |

---

## Time estimates

Honest:

| Goal | Time |
| ---- | ---- |
| "Hello world" terminal (PTY + xterm.js + Electron) | **A weekend** |
| Tabs + splits + sidebar + workspace UX | **1-3 months** |
| Production-quality workspace orchestrator | **6-12 months** |
| Robust multiplexer with session persistence | **2-3 years** |
| Native GPU renderer competitive with Alacritty | **3-5 years** |
| Renderer + multiplexer + ecosystem (à la WezTerm) | **5-10 years** |

WezTerm started 2018, ~7 years of full-time work
by Wez Furlong. Ghostty took Mitchell Hashimoto
~2 years of focused work on a known-domain. zellij
took years of community work just to get the
multiplexer right (no renderer).

---

## The cheaper path: compose existing parts

You do NOT have to build everything.

```
Use:                          Get:
─────────────────────────────  ────────────────────────────
node-pty                       PTY (the easy part)
xterm.js                       95% renderer (the hard part)
your code                      workspace UI (the fun part)
Electron / Tauri               window shell
zellij / tmux (optional)       multiplexer / sessions
```

This is what VSCode terminal does. What Wave does.
What Hyper does. What Tabby does. What Rock does.

You skip the 5-10 year renderer problem and the
2-3 year multiplexer problem. You spend your time
on workspace UX, which is where the unexplored
value lives.

---

## When to actually build from scratch

If, and only if, you have BOTH:

1. **A specific performance / correctness need**
   that no existing renderer hits (sixel-heavy
   workflows, hyper-low latency, exotic platform).
2. **Years of headcount** to invest.

For everyone else: compose. Build the workspace
layer. Stand on the giants.

---

## Related

- The available giants: `terminal-landscape.md`
- What Rock chose: `rock-positioning.md`

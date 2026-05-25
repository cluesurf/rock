# What's hard about building a terminal

Spawning a shell is easy. **Correctly emulating a terminal is one of the
deepest swamps in systems software.** Here's a tour, so it's clear why
Term stands on the shoulders of xterm.js + node-pty instead of rolling
its own.

## The three layers

```
┌────────────────────────────────────────────┐
│  3. Workspace UI (sidebar, tabs, layout)   │  ← Term's focus
├────────────────────────────────────────────┤
│  2. Terminal emulator (state + rendering)  │  ← xterm.js does this
├────────────────────────────────────────────┤
│  1. PTY + shell process                    │  ← node-pty does this
└────────────────────────────────────────────┘
```

The bottom two layers are where the years go. The top layer is where the
interesting design lives. Term skips the bottom two and builds only the
top.

## Layer 1: PTY

A pseudo-terminal pair is a kernel construct: one side (master)
reads/writes bytes; the other side (slave) looks like a real terminal
device to the shell process.

In practice, this is **a solved problem**:

- macOS / Linux: `openpty()` + `forkpty()`
- Windows: ConPTY (Microsoft's modern replacement for the old WinConsole
  horror)
- Node binding: **node-pty** wraps all three

```ts
import pty from 'node-pty'
const sh = pty.spawn('zsh', [], { cols: 80, rows: 24 })
sh.onData(chunk => /* handle output */)
sh.write('echo hi\r')
```

The hard parts are gone by 2026: signal forwarding, job control, window
resize signals (SIGWINCH), child reaper. If you use node-pty you inherit
all of it.

## Layer 2: the terminal emulator

This is the swamp. The shell writes bytes that mix **text** with
**escape sequences** describing color, cursor moves, alternate screens,
mouse tracking, hyperlinks, and dozens of other commands.

Five distinct families of escape sequences, each with its own grammar:

| Family        | Started by                           | What it does                           |
| ------------- | ------------------------------------ | -------------------------------------- |
| **C0 / C1**   | Single byte (`\x07`, `\x08`, `\x1b`) | Bell, backspace, escape                |
| **CSI**       | `ESC [ ... letter`                   | Cursor moves, colors (SGR), modes      |
| **OSC**       | `ESC ] ... ST`                       | Window title, hyperlinks, palette, cwd |
| **DCS**       | `ESC P ... ST`                       | Sixel images, terminfo queries         |
| **SS3 / SS2** | `ESC O ...`                          | Function keys in some modes            |

A correct parser is a state machine across all of these.
[Paul Williams' VT500 parser](https://vt100.net/emu/dec_ansi_parser) is
the reference everyone copies. xterm.js, libvte, iTerm2's parser, and
Alacritty all started from it.

That's just **parsing**. Then you have to **interpret**.

### Alternate screen buffer

Full-screen TUIs (vim, htop, tmux) flip into a separate screen, do their
thing, and flip back leaving your prompt intact. Two grids, two cursor
positions, two scrollback regions, mode-aware redraws. Skipping this
correctly is why `vim` looks broken in toy emulators.

### Modes (DECSET / DECRST)

Hundreds of toggleable modes. Bracketed paste, mouse reporting (X10,
X11, SGR, urxvt formats), application cursor keys, focus events,
synchronized output, kitty keyboard protocol. Each app you run flips a
different subset on startup and expects them respected.

### Colors

```
16-color        ESC [ 30-37, 40-47
256-color       ESC [ 38;5;N or 48;5;N
truecolor       ESC [ 38;2;R;G;B or 48;2;R;G;B
```

You support all three. Truecolor is technically optional but anyone
using a 2020s terminal expects it.

### Unicode width

A single rendered glyph can be:

```
A           1 codepoint,  1 column
界          1 codepoint,  2 columns (CJK wide)
é           2 codepoints, 1 column   (e + combining acute)
👨‍👩‍👧‍👦         7+ codepoints, 1 column   (ZWJ family emoji)
🇯🇵          2 codepoints, 2 columns   (regional indicator pair)
```

Cursor math depends on getting this right. The standard table is
**Unicode Standard Annex #11** ("East Asian Width"), which is a moving
target every Unicode release. Emoji ZWJ sequences need a separate
grapheme breaker. Get any of this wrong and your cursor position drifts
silently, then `vim` lays out a paragraph on top of itself.

### Scrollback

Storing the lines that scrolled off the top. Sounds trivial; it isn't.

- A `tail -f` on a busy log produces millions of lines. Naive
  Array<string> eats gigabytes.
- Search needs to be fast (Ctrl+F live filter).
- Each line has SGR state attached (color, style), so it isn't really a
  string but a styled-cell array.
- Resize triggers reflow: do you re-wrap historical lines? At what
  column?

xterm.js uses a circular buffer with run-length-encoded attributes per
cell. Implementing this from scratch is a multi-week project, and
"correct under resize" is multi-month.

### Reflow on resize

What happens when an 80-column terminal becomes 120 columns?

- Wrapped lines should ideally **un-wrap** to fill the new width
- The cursor should land where the shell thinks it is
- Alternate screen contents should re-letterbox cleanly
- Curses apps need a SIGWINCH and then a clean redraw

tmux famously struggled with this for years. It's genuinely hard.

### Performance

Modern terminals push absurd throughput.

```
yes | head -c 1000000000        # 1 GB of "y\n"
cargo build --release           # compiler firehose
```

You need to:

- Parse bytes faster than the shell produces them
- Coalesce updates into ≤ 60 fps redraws
- Avoid layout thrash if the UI is DOM-based
- Use the GPU for glyph compositing if you're native
- Keep keystroke latency under one frame (16ms) for good feel

This is why Alacritty / Ghostty / Kitty exist. xterm.js isn't _as_ fast
(it's a Canvas/WebGL renderer), but it hits the bar where vim/tmux feel
snappy. Good enough for 99% of use.

## Layer 3 sidequest: multiplexing

tmux and zellij are not "tab managers." They're **distributed terminal
operating systems**:

- A long-lived daemon owns the PTYs
- Multiple clients can attach to the same session
- Each client has its own dimensions
- Resize semantics need to reconcile across clients
- Sessions survive disconnect, reboot, SSH dropout

That requires:

- Daemon architecture with IPC
- Virtual screen state per session
- Diff-replay protocol for late-joining clients
- Synchronized cursor / mode state across clients
- Robust SIGCHLD / zombie / orphan handling

This alone is a multi-year project. Most teams underestimate it by 10x.

## The long tail

Once the core works, the **endless** tail begins:

- Kitty keyboard protocol (modern keys: F13-F24, modifiers on more keys,
  etc.)
- OSC 52 clipboard reads (security model is its own essay)
- OSC 7 cwd reporting (so the terminal knows where the shell `cd`'d to)
- OSC 8 hyperlinks (clickable URLs in terminal output)
- Sixel + Kitty image protocols (inline images)
- Synchronized output (DCS 2026, no-tear redraws)
- IME composition (Japanese / Chinese / Korean input)
- Pasting large blocks safely (bracketed paste mode)
- Per-platform clipboard quirks
- Per-platform Unicode font fallback chains
- Retina / fractional scaling
- Wake-from-sleep redraws (cursor disappears on macOS)

Years of fix-this-one-edge-case work, every one of which breaks some
specific app in production until handled.

## Term's escape hatch

**Term builds layer 3 and uses other people's layers 1 and 2.**

| Layer            | Term uses       | Why                                                                                             |
| ---------------- | --------------- | ----------------------------------------------------------------------------------------------- |
| 1 (PTY)          | **node-pty**    | Microsoft maintains it. Works on every platform.                                                |
| 2 (emulator)     | **xterm.js**    | Same engine as VS Code's terminal. Parser + buffer + renderer + addons. Battle-tested at scale. |
| 3 (workspace UI) | **Term itself** | React tree, sidebar, command palette, hotkeys, .tool/term/code/ JIT.                                 |

This is the same shape VS Code's terminal, Hyper, and Tabby use. The
trade is **size** (we ship Chromium + a JS runtime) for **velocity**
(Term added drag-and-drop tree tabs in an afternoon; doing that in
Alacritty would be months).

If at some point Term wants the native-speed path, the move is to
**embed Ghostty** or a similar engine via FFI and keep the workspace
layer in TypeScript. That's a 2027 conversation, not today.

## Further reading

- [VT100.net](https://vt100.net): the canonical archive of DEC terminal
  specs
- [XTerm Control Sequences](https://invisible-island.net/xterm/ctlseqs/ctlseqs.html)
  : the de-facto modern reference
- [Unicode UAX #11](https://www.unicode.org/reports/tr11/): East Asian
  width
- [xterm.js source](https://github.com/xtermjs/xterm.js): read the
  parser if you want a tour of the swamp
- [Ghostty docs](https://ghostty.org/docs): clear, modern explanation of
  the protocol surface

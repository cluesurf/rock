# What is rock?

The short answer:

> **A headless, hackable terminal system.**

Not a terminal emulator. Not a multiplexer. Not a
framework. A library you compose into your own terminal-
workspace app, with sensible defaults that get you running
fast.

---

## "Headless"

Rock ships **no styling by default**. Components emit
structure + data attributes. You provide the look.

What "headless" means in practice:
- Library components have ZERO opinions about colors,
  spacing, borders, typography
- Compose with Tailwind, CSS modules, styled-components,
  vanilla CSS, shadcn — rock doesn't care
- No prescribed app layout (no "your sidebar goes on the
  left"). You decide.
- No required theme. Bring your own or use a preset.

Same pattern as Radix UI, Headless UI, React Aria, Tanstack
Table. Library = behavior + structure. You = look + feel.

---

## "Hackable"

Everything is composable React + plain TypeScript. No
proprietary config schema. No plugin marketplace lock-in.
No magic.

What "hackable" means in practice:
- The app is YOUR React tree. Rock provides primitives
  (`<Nest>`, `<Slab>`, `<Dock>`, `<Tree>`, `<Bar>`,
  `<Palette>`); you arrange them.
- The workspace is a typed TypeScript object. No DSL to
  learn.
- Hooks expose state directly (`useSlab`, `useFocus`,
  `useStatus`). Build whatever UI on top.
- Imperative actions (`send`, `spawn`, `kill`, `focus`)
  for scripting from any handler.
- No "rock way" you have to do things — except spawning a
  PTY, which rock handles for you.

---

## "Sensible defaults"

Headless doesn't mean ugly. Rock ships an **optional
Tailwind preset** that styles every component with
sensible defaults:

```css
@import "tailwindcss";
@import "@cluesurf/rock/tailwind/preset.css";
```

That gives you:
- Dark-mode terminal chrome (matches xterm aesthetics)
- Status indicators that change color based on slab state
- Borders, padding, typography on `<Slab>`, `<Tree>`,
  `<Bar>`, `<Palette>`
- Polished out of the box

Skip the preset if you want unstyled or use a different
system. The data attributes (`[data-rock-*]`) are stable;
any CSS can hook in.

---

## "Terminal system"

Rock isn't one terminal — it's the infrastructure for
ANY terminal-workspace app:
- A dev tool with sidebar + multiple panes
- A DevOps cockpit with one terminal per service
- A music studio with one terminal per process
- A blog writer with a markdown editor + a build slab
- A CI dashboard with a slab per pipeline stage
- Anything where "running processes + custom UI around
  them" is the shape

The PTY lifecycle, IPC, xterm rendering, layout splits,
session persistence — rock handles. The product idea — you
provide.

---

## What rock is NOT (the same words again, for clarity)

| Claim | Reality |
|---|---|
| A terminal emulator | No. Use xterm.js (which rock wraps). |
| A multiplexer | No. Slabs die with the window. Run tmux inside if you need persistence. |
| A framework | No. It's a primitives library. |
| An app | No. The demo is an app. Rock is the library underneath. |
| A UI kit | No. Headless. |
| A CLI tool | The `rock` CLI exists for scaffolding + control, but it's not the main artifact. |
| Cross-platform native | Electron-based. macOS, Linux, Windows. |
| GPU-accelerated | No. xterm.js is DOM-based. |

---

## The five-word summary

> **Headless hackable React terminal system.**

If you want to:
- Build a custom terminal-workspace app for YOUR workflow
- Use TypeScript + React + your own design system
- Get the boring parts (PTY, IPC, rendering) for free
- Keep total control over UX

Rock is for you.

If you want a polished off-the-shelf terminal app: use
WezTerm, Ghostty, Kitty, Wave, or Tabby.

---

## Related

- Public quickstart: `quickstart.md`
- Concepts (deep dive): `concepts.md`
- Terminal ecosystem: `terminal-landscape.md`
- Why building from scratch is hard: `terminal-from-scratch.md`

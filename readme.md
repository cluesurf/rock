<br/>
<br/>
<br/>
<br/>
<br/>
<br/>

<p align='center'>
  <img src='https://github.com/cluesurf/tool/blob/make/view/tool.png?raw=true' height='256'/>
</p>

<h3 align='center'>@cluesurf/tool</h3>
<p align='center'>
  A Hackable Workshop 𐌎
</p>

<br/>
<br/>
<br/>

## Overview

Monorepo for the four desktop apps:

| icon | glyph  | app  | domain                          | folder       | package          | status |
| ----- | :-----: | ---- | ------------------------------- | ------------ | ---------------- | ------ |
| <img src='https://github.com/cluesurf/tool/blob/make/tool/term/view/term.svg?raw=true&view' height='32'/> | **▣** | `term` | terminal                        | `tool/term/` | `@cluesurf/term` | active |
| <img src='https://github.com/cluesurf/tool/blob/make/tool/base/view/base.svg?raw=true&view' height='32'/> | **▥** | `base` | databases                | `tool/base/` | `@cluesurf/base` | stub   |
| <img src='https://github.com/cluesurf/tool/blob/make/tool/mesh/view/mesh.svg?raw=true&view' height='32'/> | **▦** | `mesh` | infrastructure                  | `tool/mesh/` | `@cluesurf/mesh` | stub   |
| <img src='https://github.com/cluesurf/tool/blob/make/tool/view/view/view.svg?raw=true&view' height='32'/> | **▤** | `view` | logs | `tool/view/` | `@cluesurf/view` | stub   |

All four share a common platform (Electron + React + xterm.js +
Tailwind). Per-app source lives at `tool/<name>/code/`; per-app Electron
shell at `tool/<name>/dock/`. Shared platform packages will eventually
live at the repo-root `code/` folder (Phase 2).

This repo was previously `cluesurf/rock` — the Term app's old code now
lives at `tool/term/`. See
[`../note/library/tool/migration-plan.md`](../../note/library/tool/migration-plan.md)
for the migration trail and
[`../note/library/workbench-architecture.md`](../../note/library/workbench-architecture.md)
for the long-term architecture.

## Develop Term

```
pnpm install                                # one-time
pnpm --filter @cluesurf/term-dock dev       # launch dev
pnpm --filter @cluesurf/term make           # build the runtime library
pnpm --filter @cluesurf/term-dock package:mac   # build Term.app
pnpm --filter @cluesurf/term-dock open      # launch the built .app
pnpm --filter @cluesurf/term ship           # release to GitHub + brew tap
```

Or via the root-level convenience scripts:

```
pnpm term:dev
pnpm term:make
pnpm term:package
pnpm term:open
pnpm term:ship
pnpm term:icons
```

## Layout

```
deck/tool/                              # @cluesurf/tool monorepo root (this folder)
├── package.json
├── pnpm-workspace.yaml                 # workspaces: tool/term, tool/term/dock
├── readme.md
└── tool/
    ├── term/                           # @cluesurf/term (the runtime library)
    │   ├── code/                       # library source
    │   │   ├── base/                   # tree / types / ids / layout / theme
    │   │   ├── boot/                   # Electron main + preload entries
    │   │   ├── desktop/                # macOS / win / linux helpers
    │   │   ├── face/                   # React components (palette, find, slab, dock, …)
    │   │   ├── node/                   # PTY manager, state-store, paths, program
    │   │   ├── theme/                  # color themes (term/, dracula, monokai, …)
    │   │   └── tailwind/               # preset.css
    │   ├── dock/                       # @cluesurf/term-dock (Electron app shell)
    │   │   ├── boot/                   # Electron main + preload entry points
    │   │   ├── call/                   # `term` CLI source + bash launcher
    │   │   ├── code/                   # base.tsx, main.tsx, index.html, assets/
    │   │   └── electron.vite.config.ts
    │   ├── view/                       # term.svg, term.png (icon sources)
    │   ├── task/                       # icons.sh, ship.sh, verify.sh, trust-keychain.sh
    │   ├── test/                       # smoke tests + zone/ demo workspace
    │   ├── note/                       # user-facing docs (concepts, hotkeys, …)
    │   └── package.json
    ├── base/                           # @cluesurf/base — stub
    ├── mesh/                           # @cluesurf/mesh — stub
    └── view/                           # @cluesurf/view — stub
```

## Naming conventions

- **Each app's runtime library** is `@cluesurf/<name>` and lives at
  `tool/<name>/code/`. Published to npm.
- **Each app's Electron shell** is `@cluesurf/<name>-dock` and lives at
  `tool/<name>/dock/`. Private — packaged via electron-builder into a
  separately-branded `.app`.
- **User project config** lives at `<project>/.tool/<name>/` — so a
  project that uses both Term and View would have `.tool/term/` and
  `.tool/view/` side by side. The umbrella `.tool/` dir replaces the old
  `.rock/`.

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

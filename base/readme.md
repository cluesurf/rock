# @cluesurf/rock-demo

Runnable Electron + React + Tailwind demo of
`@cluesurf/rock`.

Three live slabs in a split layout:

```
┌─────────────────────┬──────────────────┐
│                     │                  │
│   zsh shell         │   top (monitor)  │
│                     │                  │
│                     ├──────────────────┤
│                     │                  │
│                     │   watch date     │
│                     │                  │
└─────────────────────┴──────────────────┘
```

Plus a sidebar with the slab list and click-to-focus.

## Layout

| File                       | What                                               |
| -------------------------- | -------------------------------------------------- |
| `boot/main.ts`             | Electron main + TerminalManager + slab spawn       |
| `boot/preload.ts`          | IPC bridge (exposes `window.app.terminal`)         |
| `code/index.html`          | Renderer HTML shell                                |
| `code/main.tsx`            | React entry                                        |
| `code/app.tsx`             | App shell, sidebar, JSX layout                     |
| `code/style.css`           | Minimal global CSS                                 |
| `electron.vite.config.ts`  | electron-vite bundler config                       |

In a real consumer app the workspace + layout + sidebar
live in `.rock/workspace.ts`, `.rock/layout.tsx`,
`.rock/sidebar.tsx`. This demo inlines them in
`boot/main.ts` and `code/app.tsx` so no folder loader
is needed.

## Run

From the rock root (`deck/rock/`):

```bash
pnpm install         # rebuilds node-pty + better-sqlite3 for Electron
pnpm dev             # compiles library + launches demo (Electron + Vite)
pnpm build           # production build
pnpm start           # preview the production build
```

Or from this folder (`deck/rock/base/`):

```bash
pnpm install
pnpm dev
pnpm build
pnpm start
```

Both routes work. The rock-root commands proxy to this
package via `pnpm --filter @cluesurf/rock-demo <script>`.

`pnpm dev` first compiles the parent `@cluesurf/rock`
library (`pnpm make` runs `tsc + tsc-alias` to populate
`../host/`), then launches the Electron app with hot
reload on the renderer.

## How it works

1. `boot/main.ts` builds an inline `defineWorkspace({...})`,
   compiles it (`compileWorkspace`), spawns a PTY per slab
   via `TerminalManager`, and wires the IPC bridge with
   `wireTerminalMain`.
2. `boot/preload.ts` calls `makeTerminalApi()` and exposes
   it at `window.app.terminal` plus a small custom channel
   for the slab-ID map.
3. `code/app.tsx` mounts `<TerminalApiProvider>`,
   `<TerminalEvents>`, and renders a JSX layout +
   sidebar using `<Split>`, `<Slab>`, `<SidebarSection>`,
   `<SlabButton>` from the library.
4. xterm.js renders the PTY output inside each `<Slab>`.

## Troubleshooting

- **`posix_spawnp failed`** when a slab tries to spawn:
  `node-pty`'s `spawn-helper` binary lost its execute
  bit during pnpm install. Run `pnpm fix-spawn-helper`
  (already wired into `predev` / `prestart`).
- **`node-pty` or `better-sqlite3` fails to load** with
  a `NODE_MODULE_VERSION` mismatch: the prebuilt binary
  doesn't match your Electron version. Run
  `pnpm rebuild-native` (uses `@electron/rebuild` via
  `pnpm dlx`, no permanent dev-dep needed).
- **Black window on launch**: parent library hasn't been
  built. Run `pnpm make` in `..` then retry.
- **Slabs show "not found"**: the slab-map bridge
  (`SlabMapBridge` in `app.tsx`) didn't fire. Check the
  Electron main process console for `did-finish-load`
  errors.

## License

GPL-3.0-or-later. See [LICENSE](../LICENSE).

## ClueSurf

Made by [ClueSurf](https://clue.surf), meditating on the universe ¤.
Follow the work on [YouTube](https://youtube.com/@cluesurf),
[X](https://x.com/cluesurf),
[Instagram](https://instagram.com/cluesurf),
[Substack](https://cluesurf.substack.com),
[Facebook](https://facebook.com/cluesurf), and
[LinkedIn](https://linkedin.com/company/cluesurf), and browse more of
our open-source work here on [GitHub](https://github.com/cluesurf).

# @cluesurf/term-dock

The Term.app host shell — Electron main + preload + minimal
React renderer that loads the user's `.tool/term/` config.

Term itself is a library (`@cluesurf/term`). This package is
the buildable, shippable application that wraps the library
and renders whatever the user puts in `.tool/term/layout.tsx`.

## How it works

```
┌───────────────────────────────────────────────────────────┐
│                    Term.app (host shell)                  │
│                                                           │
│   boot/index.ts       discovers .tool/term/, JIT-bundles       │
│                       layout.tsx via esbuild, calls       │
│                       @cluesurf/term/boot                 │
│                                                           │
│   code/base.tsx       asks main for user bundles.         │
│                       If present, imports                 │
│                       term://user/layout.js and renders   │
│                       it. Else renders a default zsh      │
│                       dock.                               │
└───────────────────────────────────────────────────────────┘
```

User `.tool/term/` files (all optional):

| File              | What                                        |
| ----------------- | ------------------------------------------- |
| `workspace.ts`    | `WorkspaceDefinition` (slabs to spawn)      |
| `layout.tsx`      | React layout (JIT-compiled per launch)      |
| `sidebar.tsx`     | React sidebar (JIT-compiled per launch)     |
| `commands.ts`     | Named commands (`term call <name>`)         |
| `plugins.ts`      | Plugin list                                 |

When launched without a project (eg `open -a Term`), the
shell walks up from the CWD looking for a `.tool/term/`. If none
is found, it falls back to `~/.tool/term/` (global), and if
that's also missing, a default single-shell workspace.

## Run

From the term root (`deck/term/`):

```bash
pnpm install         # rebuilds node-pty + better-sqlite3 for Electron
pnpm dev             # compiles lib + launches Term with hot reload
pnpm build           # production renderer build
pnpm start           # preview the production build
pnpm package:mac     # build Term.app + .dmg + .zip
```

Or from this folder (`deck/term/base/`):

```bash
pnpm install
pnpm dev
pnpm build
pnpm start
```

Both routes work. The rock-root commands proxy here via
`pnpm --filter @cluesurf/term-dock <script>`.

`pnpm dev` first compiles the parent `@cluesurf/term`
library (`pnpm make` runs `tsc + tsc-alias` to populate
`../host/`), then launches the Electron app with hot reload
on the renderer.

## How the JIT layout works

1. `boot/index.ts` (main process) calls `findToolFolders` to
   locate `.tool/term/`, then `bundleUserModule` (esbuild) to
   bundle `layout.tsx` into ESM. The compiled code is
   passed to `boot()` as `userBundles['layout.js']`.
2. `boot()` (in the library) registers a custom `term://`
   protocol and an IPC method `term:get-user-bundles`.
3. The renderer mounts `<App />`. `mount()` first calls
   `installExternalBridge()` to expose React + the face
   surface on `globalThis.__term__`.
4. `<App />` queries `window.app.getUserBundles()`. If
   `'layout.js'` is in the list, it dynamic-imports
   `term://user/layout.js`. The compiled bundle's
   `import { Slab } from '@cluesurf/term/face'` resolves
   via shim modules that read from `globalThis.__term__`,
   so React isn't loaded twice.
5. If no user layout exists, `<App />` renders a default
   single-shell dock so the app is still usable.

See `code/base.tsx` for the loader and the lib's
`code/face/external-bridge.ts` + `code/node/layout-bundle.ts`
for the bundling and bridging code.

## Troubleshooting

- **`posix_spawnp failed`** on slab spawn: `node-pty`'s
  `spawn-helper` binary lost its execute bit. Run
  `pnpm fix-spawn-helper` (already wired into `predev` /
  `prestart`).
- **`node-pty` or `better-sqlite3` fails with
  `NODE_MODULE_VERSION` mismatch**: prebuilt binary doesn't
  match your Electron version. Run `pnpm rebuild-native`.
- **Black window on launch**: parent library wasn't built.
  Run `pnpm make` in `..` and retry.
- **`term: shared module not provided by renderer: <id>`**:
  your `.tool/term/layout.tsx` imports something Term doesn't
  expose to JIT bundles. Either drop the import or call
  `extendExternalBridge({ '<id>': <module> })` in your
  custom `mount()` to register it.

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

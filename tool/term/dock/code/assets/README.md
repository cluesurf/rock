# Icon assets

This folder holds the three platform icon files electron-builder
bundles into the packaged app:

| File         | Platform | Notes                                  |
| ------------ | -------- | -------------------------------------- |
| `icon.icns`  | macOS    | 10-size container                      |
| `icon.ico`   | Windows  | multi-resolution container             |
| `icon.png`   | Linux    | 1024×1024 (also used in dev-mode dock) |

## How to (re)generate them

Don't hand-build these. Run the script:

```sh
cd cluesurf/deck/rock
pnpm make:icons
```

That reads `view/mac.svg` (preferred) or `view/mac.png` and
writes all three files into this folder. Re-run any time the
source art changes.

The script lives at `cluesurf/deck/term/task/icons.sh`. See the
top of that file for required tooling (`sips` + `iconutil` are
built in; `magick` and `rsvg-convert` are Homebrew installs
for the Windows .ico and SVG input respectively).

## If you don't generate them

electron-builder falls back to the default Electron icon when
these files are missing. The app name in Cmd+Tab still shows
"Term" — only the visual icon stays default.

## Cross-platform reference

For the full reference on icon formats, sizes, and design
rules per platform (macOS / iOS / Android / Windows / Linux),
see `cluesurf/note/tool/icons/readme.md`.

# Quickstart

## Install

```bash
brew tap cluesurf/tool
brew install --cask cluesurf/tool/rock
```

You get **Rock.app** in `/Applications` plus the **`rock` CLI**
symlinked to `/usr/local/bin/rock`.

The cask strips the macOS quarantine attribute on install so you don't
see the "unknown developer" Gatekeeper dialog on first launch. Rock is
currently ad-hoc signed; once proper Developer ID signing lands the
postflight strip goes away.

## First launch

```bash
rock
```

Either opens Rock.app at `$PWD`. You'll see:

- A sidebar with one tab (`shell`)
- A terminal pane with your shell prompt
- Click in and start typing

## Bind a project

For project-scoped terminals (each project remembers its tabs, sidebar
layout, window position):

```bash
cd ~/code/my-project
rock bind          # creates .rock/code/index.tsx + .gitignore
rock               # launches Rock here
```

Now this project has:

- `.rock/code/index.tsx` — the workspace + optional Layout
  - Sidebar (committable)
- `.rock/base.json` — initial baseline (committable, optional)
- `.rock/base.local.json` — your per-machine state (gitignored)
- `.rock/.gitignore` — auto-managed by Rock

Edit `.rock/code/index.tsx` to define your tabs:

```ts
import { workspace } from '@cluesurf/rock'

export default {
  workspace: workspace({
    name: 'my-project',
    slabs: {
      shell: {},
      dev: { command: 'pnpm dev' },
      logs: { command: 'tail -f logs/app.log' },
      api: { cwd: './base', command: 'pnpm dev' },
    },
  }),
}
```

Re-launch — those tabs spawn automatically.

## Daily use

| Action                | How                                     |
| --------------------- | --------------------------------------- |
| Launch in current dir | `rock` (in terminal)                    |
| Launch in another dir | `rock open ~/other-project`             |
| New tab               | `Cmd+T` in Rock                         |
| Close tab             | `Cmd+Backspace` (closes window if last) |
| Cycle tabs            | `Cmd+Shift+]` / `Cmd+Shift+[`           |
| Rename tab            | Click leaf → Enter, or double-click     |
| New group             | `Cmd+Shift+G`                           |
| Drag tabs around      | Drag the sidebar leaf                   |
| Toggle sidebar        | `Cmd+B`                                 |
| Full-screen           | `Ctrl+Cmd+F`                            |
| List tabs from CLI    | `rock list`                             |
| Send keystrokes       | `rock send <slab> "..."`                |
| Spawn from CLI        | `rock spawn dev --cwd=./api`            |

## What persists

- Tab list, labels, last-known cwds (`base.local.json`)
- Sidebar tree (groups + ordering, `base.local.json`)
- Window position + sidebar width (`base.local.json`)
- Custom workspace + Layout components (`.rock/code/`)
- Theme choice (localStorage in Rock — per-window)

Re-launching at the same directory restores everything.

## Set up shell integration (recommended)

Rock can track each tab's current working directory if your shell emits
an OSC 7 escape after every `cd`. Add to your shell rc:

```bash
# ~/.zshrc
function chpwd() { printf '\e]7;file://%s%s\a' "$HOST" "$PWD"; }

# ~/.bashrc
PROMPT_COMMAND='printf "\e]7;file://%s%s\a" "$HOSTNAME" "$PWD"'
```

Without it, Rock remembers the directory where each shell was spawned
but doesn't update if you `cd` around. With it, tabs reopen at the
directory you last `cd`'d to.

## Uninstall

```bash
brew uninstall --cask cluesurf/tool/rock
brew untap cluesurf/tool
```

Cleanup project state per-project:

```bash
rm -rf ~/code/my-project/.rock
```

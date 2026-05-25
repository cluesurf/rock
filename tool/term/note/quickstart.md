# Quickstart

## Install

```bash
brew tap cluesurf/tool
brew install --cask cluesurf/tool/rock
```

You get **Term.app** in `/Applications` plus the **`term` CLI**
symlinked to `/usr/local/bin/rock`.

The cask strips the macOS quarantine attribute on install so you don't
see the "unknown developer" Gatekeeper dialog on first launch. Term is
currently ad-hoc signed; once proper Developer ID signing lands the
postflight strip goes away.

## First launch

```bash
rock
```

Either opens Term.app at `$PWD`. You'll see:

- A sidebar with one tab (`shell`)
- A terminal pane with your shell prompt
- Click in and start typing

## Bind a project

For project-scoped terminals (each project remembers its tabs, sidebar
layout, window position):

```bash
cd ~/code/my-project
term bind          # creates .tool/term/code/index.tsx + .gitignore
term               # launches Term here
```

Now this project has:

- `.tool/term/code/index.tsx` — the workspace + optional Layout
  - Sidebar (committable)
- `.tool/term/base.json` — initial baseline (committable, optional)
- `.tool/term/base.local.json` — your per-machine state (gitignored)
- `.tool/term/.gitignore` — auto-managed by Term

Edit `.tool/term/code/index.tsx` to define your tabs:

```ts
import { workspace } from '@cluesurf/term'

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
| Launch in current dir | `term` (in terminal)                    |
| Launch in another dir | `term open ~/other-project`             |
| New tab               | `Cmd+T` in Term                         |
| Close tab             | `Cmd+Backspace` (closes window if last) |
| Cycle tabs            | `Cmd+Shift+]` / `Cmd+Shift+[`           |
| Rename tab            | Click leaf → Enter, or double-click     |
| New group             | `Cmd+Shift+G`                           |
| Drag tabs around      | Drag the sidebar leaf                   |
| Toggle sidebar        | `Cmd+B`                                 |
| Full-screen           | `Ctrl+Cmd+F`                            |
| List tabs from CLI    | `term list`                             |
| Send keystrokes       | `term send <slab> "..."`                |
| Spawn from CLI        | `term spawn dev --cwd=./api`            |

## What persists

- Tab list, labels, last-known cwds (`base.local.json`)
- Sidebar tree (groups + ordering, `base.local.json`)
- Window position + sidebar width (`base.local.json`)
- Custom workspace + Layout components (`.tool/term/code/`)
- Theme choice (localStorage in Term — per-window)

Re-launching at the same directory restores everything.

## Set up shell integration (recommended)

Term can track each tab's current working directory if your shell emits
an OSC 7 escape after every `cd`. Add to your shell rc:

```bash
# ~/.zshrc
function chpwd() { printf '\e]7;file://%s%s\a' "$HOST" "$PWD"; }

# ~/.bashrc
PROMPT_COMMAND='printf "\e]7;file://%s%s\a" "$HOSTNAME" "$PWD"'
```

Without it, Term remembers the directory where each shell was spawned
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

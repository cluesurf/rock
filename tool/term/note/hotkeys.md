# Hotkeys

Every keyboard shortcut Term ships with. Modifier
notation: `Cmd` = ⌘, `Ctrl` = ⌃, `Shift` = ⇧.

## Window

| Keys             | Action                                           |
| ---------------- | ------------------------------------------------ |
| `Cmd+N`          | New window (same workspace)                      |
| `Cmd+W`          | Close active tab (alias for `Cmd+Backspace`)     |
| `Cmd+Backspace`  | Close active tab; closes window if last tab      |
| `Cmd+B`          | Toggle sidebar visibility                        |
| `Ctrl+Cmd+F`     | Toggle full-screen                               |

## Tabs (slabs)

| Keys              | Action                                          |
| ----------------- | ----------------------------------------------- |
| `Cmd+T`           | New tab (inside focused group, or at root)      |
| `Cmd+Shift+]`     | Next tab                                        |
| `Cmd+Shift+[`     | Previous tab                                    |
| `Cmd+Backspace`   | Close active tab + kill its PTY                 |

## Sidebar tree (when a row is focused)

| Keys              | Action                                          |
| ----------------- | ----------------------------------------------- |
| `↑` / `↓`         | Move focus to previous / next visible row       |
| `→`               | Group: expand. Leaf: focus the terminal         |
| `←`               | Group: collapse                                 |
| `Space`           | Toggle group expanded                           |
| `Enter`           | Activate leaf, OR rename if already active      |
| `Cmd+T`           | New tab as child of focused group               |
| `Cmd+Shift+G`     | New group as sibling of focused row             |
| `Cmd+Backspace`   | Delete focused row + its slabs                  |
| `Delete`          | Alias for delete                                |

## Rename in place

| Keys     | Action                                                 |
| -------- | ------------------------------------------------------ |
| Type     | Edit the label                                         |
| `Enter`  | Save                                                   |
| `Escape` | Cancel and revert                                      |
| Click out| Save (blur commits the current value)                  |

## Drag-and-drop

Mouse only:

- Drag a leaf or group onto another leaf → drop above/below
- Drag onto a group header → drop INSIDE the group
- Drag past the last visible row → append to root

Visual cues:

- 2px accent bar above/below target = sibling drop
- Full accent tint on group header = inside-group drop
- Source row fades to 35% opacity while being dragged
- Drop animation: 180ms ease-out-back

## Cancel actions

| Keys     | Action                                                 |
| -------- | ------------------------------------------------------ |
| `Escape` | Cancels rename mode (reverts to previous label)        |
| `Escape` | (during drag) cancels the in-progress drag             |

## Reserved by macOS (not Term)

These work because they're system-level — Term doesn't
override them:

| Keys           | Action                                              |
| -------------- | --------------------------------------------------- |
| `Cmd+Q`        | Quit Term entirely                                  |
| `Cmd+H`        | Hide Term                                           |
| `Cmd+M`        | Minimize the window                                 |
| `Cmd+Tab`      | Switch to next app                                  |
| `Cmd+Space`    | Spotlight (or Alfred / Raycast)                     |
| `Cmd+,`        | Preferences (no-op in Term right now)               |

## Inside the terminal

Standard xterm/zsh behavior — Term doesn't touch these:

| Keys             | Action                                            |
| ---------------- | ------------------------------------------------- |
| `Ctrl+C`         | Interrupt foreground process                      |
| `Ctrl+D`         | EOF (exit shell if at empty prompt)               |
| `Ctrl+Z`         | Suspend foreground process                        |
| `Ctrl+L`         | Clear screen                                      |
| `Ctrl+R`         | Reverse-search history                            |
| `Ctrl+A` / `Ctrl+E` | Cursor to start/end of line                    |
| `Cmd+C` / `Cmd+V` | Copy / paste (with multi-line warning on paste)  |
| Triple-click     | Select line                                       |
| Double-click     | Select word                                       |
| Cmd+click on URL | Open in default browser                           |
| Cmd+click on path| Open in default editor / Finder                   |

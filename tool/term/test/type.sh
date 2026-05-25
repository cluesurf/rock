#!/usr/bin/env bash
# Visual smoke test for the cluesurf theme.
# Run inside a Term terminal to eyeball every color + attribute.
#
#   bash test/type.sh

set -u

# ANSI helpers
e() { printf '\033[%sm' "$1"; }
r() { e 0; }                 # reset

# 16 standard color names mapped to their SGR codes.
# Foreground: 30-37 standard, 90-97 bright.
# Background: 40-47 standard, 100-107 bright.
COLORS=(
  "black:30:40"
  "red:31:41"
  "green:32:42"
  "yellow:33:43"
  "blue:34:44"
  "magenta:35:45"
  "cyan:36:46"
  "white:37:47"
)
BRIGHT=(
  "brightBlack:90:100"
  "brightRed:91:101"
  "brightGreen:92:102"
  "brightYellow:93:103"
  "brightBlue:94:104"
  "brightMagenta:95:105"
  "brightCyan:96:106"
  "brightWhite:97:107"
)

section() {
  printf '\n'
  e 1; printf '── %s ──' "$1"; r
  printf '\n'
}

section "Foreground colors (regular)"
for spec in "${COLORS[@]}"; do
  name="${spec%%:*}"; rest="${spec#*:}"; fg="${rest%%:*}"
  e "$fg"; printf '  %-15s  %s' "$name" "The quick brown fox jumps."; r
  printf '\n'
done

section "Foreground colors (bright)"
for spec in "${BRIGHT[@]}"; do
  name="${spec%%:*}"; rest="${spec#*:}"; fg="${rest%%:*}"
  e "$fg"; printf '  %-15s  %s' "$name" "The quick brown fox jumps."; r
  printf '\n'
done

section "Background colors (regular)"
for spec in "${COLORS[@]}"; do
  name="${spec%%:*}"; rest="${spec#*:}"; bg="${rest##*:}"
  # Pick a contrasting foreground per bg so the label is
  # readable: bright white on dark bgs, black on light.
  case "$name" in
    black|blue|magenta) fg='97' ;;  # bright white
    *)                  fg='30' ;;  # black
  esac
  e "$fg;$bg"; printf '  %-15s                                 ' "$name"; r
  printf '\n'
done

section "Background colors (bright)"
for spec in "${BRIGHT[@]}"; do
  name="${spec%%:*}"; rest="${spec#*:}"; bg="${rest##*:}"
  case "$name" in
    brightBlack|brightBlue|brightMagenta) fg='97' ;;
    *)                                    fg='30' ;;
  esac
  e "$fg;$bg"; printf '  %-15s                                 ' "$name"; r
  printf '\n'
done

section "Text attributes"
e 1;          printf '  bold              %s' "Lorem ipsum dolor sit amet."; r; printf '\n'
e 2;          printf '  dim               %s' "Lorem ipsum dolor sit amet."; r; printf '\n'
e 3;          printf '  italic            %s' "Lorem ipsum dolor sit amet."; r; printf '\n'
e 4;          printf '  underline         %s' "Lorem ipsum dolor sit amet."; r; printf '\n'
e '4:2';      printf '  double underline  %s' "Lorem ipsum dolor sit amet."; r; printf '\n'
e '4:3';      printf '  curly underline   %s' "Lorem ipsum dolor sit amet."; r; printf '\n'
e 7;          printf '  inverse           %s' "Lorem ipsum dolor sit amet."; r; printf '\n'
e 9;          printf '  strikethrough     %s' "Lorem ipsum dolor sit amet."; r; printf '\n'
e '1;3';      printf '  bold italic       %s' "Lorem ipsum dolor sit amet."; r; printf '\n'
e '1;4';      printf '  bold underline    %s' "Lorem ipsum dolor sit amet."; r; printf '\n'

section "Bold colored text (semantic + tints)"
for spec in "${COLORS[@]}"; do
  name="${spec%%:*}"; rest="${spec#*:}"; fg="${rest%%:*}"
  e "1;$fg"; printf '  bold %-10s  %s' "$name" "The quick brown fox jumps."; r
  printf '\n'
done

section "Underline colored text"
for spec in "${COLORS[@]}"; do
  name="${spec%%:*}"; rest="${spec#*:}"; fg="${rest%%:*}"
  e "4;$fg"; printf '  underline %-10s %s' "$name" "The quick brown fox jumps."; r
  printf '\n'
done

section "Foreground × Background grid (regular)"
printf '          '
for spec in "${COLORS[@]}"; do
  bgname="${spec%%:*}"
  printf ' %-7s' "$(printf '%s' "$bgname" | cut -c1-7)"
done
printf '\n'
for fgSpec in "${COLORS[@]}"; do
  fgName="${fgSpec%%:*}"; fgRest="${fgSpec#*:}"; fg="${fgRest%%:*}"
  printf '%-9s ' "$(printf '%s' "$fgName" | cut -c1-9)"
  for bgSpec in "${COLORS[@]}"; do
    bgRest="${bgSpec#*:}"; bg="${bgRest##*:}"
    e "$fg;$bg"; printf ' Abc 123'; r
  done
  printf '\n'
done

section "256-color palette (every 16th from 0..255)"
for i in 0 16 32 48 64 80 96 112 128 144 160 176 192 208 224 240; do
  e "38;5;$i"; printf '  %3d  ' "$i"; r
done
printf '\n'

section "Truecolor (RGB) gradient — violet to emerald"
for i in $(seq 0 1 30); do
  r1=$(( 139 + (16 - 139) * i / 30 ))
  g1=$(( 92  + (185 - 92) * i / 30 ))
  b1=$(( 246 + (129 - 246) * i / 30 ))
  e "38;2;${r1};${g1};${b1}"; printf '█'; r
done
printf '\n'

section "URLs + paths (xterm detects + underlines these)"
printf '  HTTPS URL       https://github.com/cluesurf/term\n'
printf '  HTTP URL        http://example.com/page?q=test&n=1\n'
printf '  with port       https://localhost:3000/api/v1/users\n'
printf '  with fragment   https://docs.example.com/guide#section-2\n'
printf '\n'
printf '  Absolute path   /Users/lancepollard/base/crew/cluesurf/deck/term/readme.md\n'
printf '  Path with line  /Users/lancepollard/base/crew/cluesurf/deck/term/code/face/dock.tsx:42\n'
printf '  Hidden dotfile  /Users/lancepollard/.zshrc\n'
printf '  Relative path   ./base/code/main.tsx\n'
printf '  Tilde path      ~/.config/term/settings.json\n'
printf '\n'
printf '  Markdown-style  See [the docs](https://github.com/cluesurf/term#readme)\n'
printf '  Plain mention   Check out cluesurf.com for more info.\n'

section "Selection (mouse-select me)"
printf 'Drag-select this line in xterm to see the selection background color.\n'

section "Cursor (focused = blinking, unfocused = solid)"
printf 'Cursor should be visible to the right of this line. ▎'
printf '\n'

section "Done"
printf 'Eyeball every block above for legibility. Specifically:\n'
printf '  - bright colors should be distinguishable from regular\n'
printf '  - bold should be readable (not just brighter, with weight)\n'
printf '  - inverse should be readable (background = foreground swap)\n'
printf '  - selection bg should contrast with both fg colors above\n'
printf '\n'

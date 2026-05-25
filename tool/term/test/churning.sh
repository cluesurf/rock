#!/usr/bin/env bash
# Visual smoke test for the sidebar "busy" indicator.
#
# Run inside a Term terminal. Spams a low-stakes counter
# to stdout forever — the activity hook (useSlabActivity)
# should flip the leaf's status glyph to "⋯" while running
# and back to "●" within ~250ms of stopping.
#
# Tweak the rate/payload below to test edge cases:
#   - quick bursts (default)
#   - sustained slow output (uncomment sleep variant)
#   - silent stretches (sleep 5; echo "still here"; sleep 5; ...)
#
# Stop with Ctrl-C.

set -u

x=0
echo "churning starts: watch the sidebar status dot."
echo "ctrl-c to stop."
echo

while true; do
  x=$((x + 1))
  x=$((x - 1))
  x=$((x + 2))
  printf '\rstep %010d  x=%d  ' "$x" "$x"
  # Default: continuous output (busy stays on)
  # Uncomment ONE of the following to vary the cadence:
  #
  # sleep 0.05   # ~20 prints/sec — clearly busy
  # sleep 0.5    # slower trickle — should still show busy
  #
  # For a "thinking" pattern (5s silent, then a burst):
  # if (( x % 100 == 0 )); then sleep 5; fi
done

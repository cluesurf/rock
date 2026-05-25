#!/usr/bin/env bash
# Visual smoke test for the sidebar "in-subprocess but
# silent" state.
#
# Run inside a Term terminal. Blocks for a long time
# without producing output — simulates `sleep 60`,
# `ssh user@host` at idle, or being inside an editor / pager
# with nothing changing.
#
# Current behavior: the busy indicator is OFF (no recent
# output), the slab's status stays "running" (PTY alive),
# so the leaf shows "●" (the running glyph). That's
# correct for "running but idle".
#
# What would be ideal (future work): a SEPARATE glyph for
# "in a subprocess / not at a prompt", distinguishable
# from "at an idle shell prompt". That requires shell
# integration (OSC 133 prompt markers) — see
# cluesurf/note/library/term/feature-roadmap.md, Tier 3.
#
# Stop with Ctrl-C.

set -u

echo "waiting starts: the slab will look 'running' (●)"
echo "but no output is flowing. Eyeball the sidebar."
echo "ctrl-c to stop."
echo

# Hold the foreground without producing output. Same shape
# as being inside vim / less / ssh / etc.
sleep 600

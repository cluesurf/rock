#!/usr/bin/env bash
# verify.sh — build Rock.app locally and smoke-test it
# before publishing.
#
# What it checks:
#   1. `pnpm package:mac` produces a .app
#   2. The bundled `rock` CLI runs (catches the hideBin /
#      ELECTRON_RUN_AS_NODE argv bug)
#   3. The main process boots without missing-module
#      errors (catches the node-pty / better-sqlite3
#      bundling bug)
#
# Run from the rock repo root:
#
#     pnpm verify
#
# Exit code 0 if everything passes; non-zero on first
# failure with a short diagnosis.

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BASE="$ROOT/base"
APP="$BASE/dist/mac-arm64/Rock.app"
LOG="$(mktemp -t rock-verify.XXXXXX.log)"

red()    { printf "\033[31m%s\033[0m\n" "$1"; }
green()  { printf "\033[32m%s\033[0m\n" "$1"; }
yellow() { printf "\033[33m%s\033[0m\n" "$1"; }
step()   { printf "\n── %s ──\n" "$1"; }

fail() {
  red "FAIL: $1"
  if [ -s "$LOG" ]; then
    echo
    echo "--- last 40 lines of $LOG ---"
    tail -40 "$LOG"
  fi
  exit 1
}

# ── 1. build ────────────────────────────────────────────
step "build"
cd "$BASE"
pnpm package:mac

[ -d "$APP" ] || fail "no .app produced at $APP"
green "  built $APP"

# ── 2. CLI smoke test ───────────────────────────────────
step "CLI smoke test"

ROCK_BIN="$APP/Contents/Resources/rock"
[ -x "$ROCK_BIN" ] || fail "bundled CLI launcher missing at $ROCK_BIN"

# --version is the cheapest path that exercises argv
# parsing all the way through yargs. If hideBin / argv
# slicing is broken, yargs prints "Unknown argument:
# <path-to-rock.js>" and exits non-zero. We capture both
# stdout and stderr because yargs writes the error to
# stderr.
if ! "$ROCK_BIN" --version >"$LOG" 2>&1; then
  fail "rock --version exited non-zero"
fi
if grep -qE "Unknown argument|Unknown command" "$LOG"; then
  fail "rock --version triggered yargs unknown-argument bug (CLI argv slicing is wrong)"
fi
green "  rock --version: OK ($(cat "$LOG" | tr -d '\n'))"

# --help also forces yargs to fully build the command
# tree, catching any subcommand wiring issues.
if ! "$ROCK_BIN" --help >"$LOG" 2>&1; then
  fail "rock --help exited non-zero"
fi
if grep -qE "Unknown argument|Unknown command" "$LOG"; then
  fail "rock --help triggered yargs unknown-argument bug"
fi
green "  rock --help: OK"

# ── 2.5. static bundled-deps check ──────────────────────
# Catches "added a peer dep, forgot to copy it into the
# .app" bugs FAST, without booting. The boot smoke test
# below can miss this class of failure when Electron pops
# a native error dialog instead of writing to stderr —
# see https://github.com/electron/electron/issues/... .
# The static check parses make/main/*.js for bare imports
# and verifies each resolves to a Node built-in, a package
# inside the asar, or a package in app.asar.unpacked.
step "bundled-deps static check"
if ! node "$ROOT/task/verify-bundled-deps.mjs" "$APP" >"$LOG" 2>&1; then
  fail "main-process imports missing from packaged .app — see log"
fi
green "  $(tail -1 "$LOG")"

# ── 3. main process boot smoke test ─────────────────────
step "main process boot smoke test"

ELECTRON_BIN="$APP/Contents/MacOS/Rock"
[ -x "$ELECTRON_BIN" ] || fail "Electron binary missing at $ELECTRON_BIN"

# If the user hasn't pre-trusted the keychain item, the
# first boot of an unsigned build pops a macOS dialog
# asking for the login password. Give them a heads-up
# instead of killing the app mid-dismissal.
if ! security find-generic-password -s "Rock Safe Storage" >/dev/null 2>&1; then
  yellow "  NOTE: macOS may prompt for your login password (Electron Safe Storage)."
  yellow "        Click 'Always Allow' to skip it, or run 'pnpm trust:keychain'"
  yellow "        once to pre-grant access and never see it again."
fi

# Run the Electron binary directly (NOT via `open`) so we
# capture stdio. --enable-logging routes Chromium / Node
# errors to stderr. Most real boot failures fire in the
# first ~1s; the long timeout exists so the user has time
# to dismiss any one-off macOS prompts (Gatekeeper, key-
# chain, Notification permission) without verify killing
# the process mid-dialog.
BOOT_TIMEOUT="${ROCK_BOOT_TIMEOUT:-20}"

# Patterns that indicate fatal main-process failures.
# - ERR_MODULE_NOT_FOUND / Cannot find: native dep not bundled
# - posix_spawnp failed: native binary lives inside asar
#   and macOS can't exec it (asarUnpack didn't fire)
# - Uncaught Exception / UnhandledPromiseRejection: bug
#   anywhere in main process boot path
FATAL_PATTERNS='ERR_MODULE_NOT_FOUND|Cannot find package|Cannot find module|Uncaught Exception|UnhandledPromiseRejection|A JavaScript error occurred|TypeError: Cannot read|SyntaxError|posix_spawnp failed|failed to spawn'

# ELECTRON_ENABLE_LOGGING=1 is more reliable than the
# --enable-logging flag for routing main-process console
# output to stderr (the flag mainly affects Chromium).
# ELECTRON_NO_ATTACH_CONSOLE=0 keeps stderr unbuffered.
"$ELECTRON_BIN" --enable-logging --no-sandbox \
  >"$LOG" 2>&1 \
  &
PID=$!
export ELECTRON_ENABLE_LOGGING=1
export ELECTRON_NO_ATTACH_CONSOLE=0

# Poll for a fatal error or for the timeout to expire,
# whichever comes first. Process death is also fatal
# (clean exit during boot means it crashed).
elapsed=0
while [ "$elapsed" -lt "$BOOT_TIMEOUT" ]; do
  if ! kill -0 "$PID" 2>/dev/null; then
    fail "main process exited unexpectedly during boot"
  fi
  if grep -qE "$FATAL_PATTERNS" "$LOG" 2>/dev/null; then
    break  # let the post-loop check report it
  fi
  sleep 1
  elapsed=$((elapsed + 1))
done

# Clean shutdown.
if kill -0 "$PID" 2>/dev/null; then
  kill -TERM "$PID" 2>/dev/null || true
  sleep 1
  kill -KILL "$PID" 2>/dev/null || true
fi
wait "$PID" 2>/dev/null || true

if grep -qE "$FATAL_PATTERNS" "$LOG"; then
  fail "main process error during boot — see log below"
fi

green "  main process booted without fatal errors"

# ── 4. asar sanity check ────────────────────────────────
step "asar sanity check"

UNPACKED="$APP/Contents/Resources/app.asar.unpacked"
if [ ! -d "$UNPACKED/node_modules/node-pty" ]; then
  fail "node-pty not unpacked at $UNPACKED/node_modules/node-pty (native .node file won't load)"
fi
green "  node-pty unpacked: OK"

# ── done ────────────────────────────────────────────────
echo
green "ALL CHECKS PASSED."
echo
echo "Next steps:"
echo "  pnpm open                       # launch the just-built .app"
echo "  pnpm ship                       # publish to GitHub + tap"
echo
echo "Log kept at: $LOG"

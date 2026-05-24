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

# ── 3. main process boot smoke test ─────────────────────
step "main process boot smoke test"

# Run the Electron binary directly (NOT via `open`) so we
# can capture stdio. --enable-logging routes Chromium /
# Node errors to stderr. We let it boot for ~4 seconds,
# then SIGTERM. If anything goes wrong during main-process
# startup (missing module, parse error, throw before app
# ready) it shows up in the log within the first second.
ELECTRON_BIN="$APP/Contents/MacOS/Rock"
[ -x "$ELECTRON_BIN" ] || fail "Electron binary missing at $ELECTRON_BIN"

"$ELECTRON_BIN" --enable-logging >"$LOG" 2>&1 &
PID=$!

# Give the main process time to fail (most errors fire
# within the first second). Sleep longer to also catch
# slow async failures.
sleep 4

# Stop the app. SIGTERM first; if it doesn't respond,
# SIGKILL on cleanup.
if kill -0 "$PID" 2>/dev/null; then
  kill -TERM "$PID" 2>/dev/null || true
  sleep 1
  kill -KILL "$PID" 2>/dev/null || true
fi
wait "$PID" 2>/dev/null || true

# Patterns that indicate fatal main-process failures.
# Add more as new failure modes are discovered.
FATAL_PATTERNS='ERR_MODULE_NOT_FOUND|Cannot find package|Cannot find module|Uncaught Exception|UnhandledPromiseRejection|A JavaScript error occurred|TypeError: Cannot read|SyntaxError'

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
echo "  open $APP                       # eyeball it"
echo "  pnpm ship                       # publish to GitHub + tap"
echo
echo "Log kept at: $LOG"

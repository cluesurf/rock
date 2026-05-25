#!/usr/bin/env bash
# Generate platform app icons for one of the ClueSurf tools.
#
# Usage:
#   bash task/icons.sh <tool>      # tool ∈ {term, base, mesh, view}
#   pnpm make:icons:term           # via root package.json
#
# Reads:
#   tool/<tool>/view/<tool>.svg    # vector source
# Writes to tool/<tool>/dock/code/assets/:
#   icon.icns                      # macOS (10-size container)
#   icon.ico                       # Windows (multi-size container)
#   icon.png                       # Linux (1024×1024 PNG)
#
# Notes on filter-heavy SVGs (e.g. drop shadows, glows, inner shadows):
#   librsvg has bugs at extreme oversample factors — filter regions in % units
#   compute incorrectly when the source is rendered at huge resolutions, and
#   gaussian blurs can balloon or get clipped. We therefore:
#     1. Render directly at each target size (no 8× oversample)
#     2. Prefer Chromium-based rendering (real browser) when available, since
#        SVG filter support there is the most accurate
#     3. Avoid Riemersma dithering, which creates ring artifacts on the
#        gradient-rich wells when the filter output has tiny noise

set -euo pipefail

# ── Tool name ────────────────────────────────────────────
TOOL="${1:-}"
if [ -z "$TOOL" ]; then
  echo "Usage: bash task/icons.sh <tool>" >&2
  echo "       tool ∈ {term, base, mesh, view}" >&2
  exit 2
fi

# ── Paths ────────────────────────────────────────────────
MONO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TOOL_ROOT="$MONO_ROOT/tool/$TOOL"
if [ ! -d "$TOOL_ROOT" ]; then
  echo "ERROR: tool '$TOOL' not found at $TOOL_ROOT" >&2
  exit 1
fi

VIEW="$TOOL_ROOT/view"
OUT="$TOOL_ROOT/dock/code/assets"
mkdir -p "$OUT"

# ── Pick source ──────────────────────────────────────────
SRC_SVG=""
if [ -f "$VIEW/$TOOL.svg" ]; then
  SRC_SVG="$VIEW/$TOOL.svg"
  echo "source: $SRC_SVG (vector)"
else
  echo "ERROR: no source icon at $VIEW/$TOOL.svg" >&2
  exit 1
fi

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

# ── Pick rasterizer ──────────────────────────────────────
# Priority: rsvg-convert (fastest, accurate for our SVGs at direct sizes) >
#           inkscape (slower but excellent filter support) >
#           chromium (most accurate but slow/flaky to script) >
#           magick (fallback)
#
# We previously preferred chromium for "browser-grade" rendering, but launching
# headless Chrome 20+ times in a script is extremely slow and prone to hangs
# (no reliable "done rendering" signal, Gatekeeper prompts, sandbox issues).
# librsvg ≥ 2.50 handles our filters fine when rendering DIRECTLY at the
# target size — which is what this script now does. Chrome remains a last
# resort that you can force via FORCE_RASTERIZER=chrome.
RASTERIZER="${FORCE_RASTERIZER:-}"
if [ -z "$RASTERIZER" ]; then
  if command -v rsvg-convert >/dev/null 2>&1; then
    RASTERIZER="rsvg"
  elif command -v inkscape >/dev/null 2>&1; then
    RASTERIZER="inkscape"
  elif command -v magick >/dev/null 2>&1 || command -v convert >/dev/null 2>&1; then
    RASTERIZER="magick"
  else
    # last resort: see if chrome is installed
    for c in "google-chrome" "chrome" "chromium" "chromium-browser" \
             "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
             "/Applications/Chromium.app/Contents/MacOS/Chromium"; do
      if command -v "$c" >/dev/null 2>&1 || [ -x "$c" ]; then
        CHROME_BIN="$c"
        RASTERIZER="chrome"
        break
      fi
    done
  fi
fi

# Resolve chrome binary if needed
CHROME_BIN="${CHROME_BIN:-}"
if [ "$RASTERIZER" = "chrome" ] && [ -z "$CHROME_BIN" ]; then
  for c in "google-chrome" "chrome" "chromium" "chromium-browser" \
           "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
           "/Applications/Chromium.app/Contents/MacOS/Chromium"; do
    if command -v "$c" >/dev/null 2>&1 || [ -x "$c" ]; then
      CHROME_BIN="$c"
      break
    fi
  done
fi

if [ -z "$RASTERIZER" ]; then
  echo "ERROR: no SVG rasterizer found." >&2
  echo "Install one of (in order of preference):" >&2
  echo "  brew install librsvg                (fast & accurate — recommended)" >&2
  echo "  brew install --cask inkscape        (also accurate)" >&2
  echo "  brew install imagemagick            (fallback)" >&2
  exit 1
fi
echo "rasterizer: $RASTERIZER"

# ImageMagick command (handles both v6 `convert` and v7 `magick`)
MAGICK=""
if command -v magick >/dev/null 2>&1; then
  MAGICK="magick"
elif command -v convert >/dev/null 2>&1; then
  MAGICK="convert"
fi

render_size() {
  local size="$1"
  local out_file="$2"
  echo "  rendering ${size}px..." >&2

  case "$RASTERIZER" in
    chrome)
      # Render via headless Chrome. WARNING: slow per-call (~1-3s) and prone
      # to hang on macOS without timeout. We give it 15s max per render.
      local html="$TMP/render_${size}.html"
      cat > "$html" <<EOF
<!DOCTYPE html><html><head><title>x</title><style>
  html,body{margin:0;padding:0;background:transparent}
  body{width:${size}px;height:${size}px}
  body > svg, body > img{width:${size}px;height:${size}px;display:block}
</style></head><body>
EOF
      cat "$SRC_SVG" >> "$html"
      echo "</body></html>" >> "$html"
      # Use `perl` for portable timeout on macOS (which lacks GNU timeout by default)
      perl -e '
        use POSIX ":sys_wait_h";
        my $pid = fork();
        if ($pid == 0) { exec @ARGV; exit 1; }
        my $deadline = time + 15;
        while (time < $deadline) {
          my $kid = waitpid($pid, WNOHANG);
          last if $kid == $pid;
          sleep 1;
        }
        if (kill 0, $pid) { kill "KILL", $pid; exit 124; }
      ' "$CHROME_BIN" \
        --headless=new \
        --disable-gpu \
        --hide-scrollbars \
        --no-sandbox \
        --default-background-color=00000000 \
        --window-size="${size},${size}" \
        --screenshot="$out_file" \
        "file://$html" \
        >/dev/null 2>&1
      ;;
    inkscape)
      # Direct render at target size — Inkscape handles filters well
      # at any resolution; no need to oversample.
      inkscape \
        --export-type=png \
        --export-filename="$out_file" \
        --export-width="$size" \
        --export-height="$size" \
        --export-background-opacity=0 \
        "$SRC_SVG" >/dev/null 2>&1
      ;;
    rsvg)
      # Direct render — oversample + downsample CORRUPTS filter output for
      # gaussian-blur-heavy SVGs (rings appear, drop shadows clip bars).
      rsvg-convert \
        -w "$size" \
        -h "$size" \
        --keep-aspect-ratio \
        --background-color=none \
        -o "$out_file" \
        "$SRC_SVG"
      ;;
    magick)
      # density 384 ≈ 1024px output for a 240-unit viewBox; scales linearly.
      # We pick a density that gives ~size pixels directly, no oversample.
      local density=$(( size * 96 / 24 ))  # rough heuristic: 4x for 96dpi base
      [ "$density" -lt 96 ] && density=96
      $MAGICK \
        -background none \
        -density "$density" \
        "$SRC_SVG" \
        -resize "${size}x${size}" \
        -colorspace sRGB \
        "$out_file"
      ;;
  esac

  # Verify the output exists and has reasonable size
  if [ ! -s "$out_file" ]; then
    echo "ERROR: rasterizer failed for size $size" >&2
    return 1
  fi
}

# ── macOS .icns ──────────────────────────────────────────
ICONSET="$TMP/icon.iconset"
mkdir "$ICONSET"
for spec in "16:16x16" "32:16x16@2x" "32:32x32" "64:32x32@2x" \
            "128:128x128" "256:128x128@2x" "256:256x256" "512:256x256@2x" \
            "512:512x512" "1024:512x512@2x"; do
  size="${spec%%:*}"
  name="${spec##*:}"
  render_size "$size" "$ICONSET/icon_${name}.png"
done

if command -v iconutil >/dev/null 2>&1; then
  iconutil -c icns "$ICONSET" -o "$OUT/icon.icns"
  echo "wrote: $OUT/icon.icns ($(du -h "$OUT/icon.icns" | cut -f1))"
else
  echo "skip: icon.icns (iconutil missing — macOS only)"
fi

# ── Windows .ico ─────────────────────────────────────────
if [ -n "$MAGICK" ]; then
  ICO_DIR="$TMP/ico"
  mkdir "$ICO_DIR"
  for s in 16 20 24 32 40 48 64 96 128 256; do
    render_size "$s" "$ICO_DIR/$s.png"
  done
  $MAGICK \
    "$ICO_DIR/16.png" "$ICO_DIR/20.png" "$ICO_DIR/24.png" \
    "$ICO_DIR/32.png" "$ICO_DIR/40.png" "$ICO_DIR/48.png" \
    "$ICO_DIR/64.png" "$ICO_DIR/96.png" "$ICO_DIR/128.png" \
    "$ICO_DIR/256.png" \
    -compress zip \
    "$OUT/icon.ico"
  echo "wrote: $OUT/icon.ico ($(du -h "$OUT/icon.ico" | cut -f1))"
else
  echo "skip: icon.ico (install: brew install imagemagick)"
fi

# ── Linux PNG (1024×1024) ────────────────────────────────
render_size 1024 "$OUT/icon.png"
echo "wrote: $OUT/icon.png ($(du -h "$OUT/icon.png" | cut -f1))"

echo
echo "done. assets at: $OUT"
ls -lh "$OUT"/icon.{icns,ico,png} 2>/dev/null || true

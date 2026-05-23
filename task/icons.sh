#!/usr/bin/env bash
# Generate platform app icons from view/mac.svg or view/mac.png.
#
# Outputs to base/code/assets/:
#   icon.icns  — macOS (10-size container)
#   icon.ico   — Windows (multi-size container)
#   icon.png   — Linux (1024×1024 PNG)
#
# Quality strategy: for SVG input, rasterize each output
# size DIRECTLY from the vector source. The rasterizer
# gets to use the original vector data with proper
# anti-aliasing at each target resolution, which beats any
# bitmap-downscale chain. No dithering — dither helps only
# when reducing color count, and adds visible noise on
# full 8-bit gradients.
#
# Preferred rasterizers, in order:
#   1. inkscape         (cleanest output, brew install --cask inkscape)
#   2. rsvg-convert     (very good, brew install librsvg)
#   3. magick (RSVG)    (acceptable fallback, brew install imagemagick)
#
# Required (macOS host):
#   sips       — built into macOS
#   iconutil   — built into macOS
#   magick     — Homebrew: brew install imagemagick   (needed for .ico)
#   At least one of inkscape / rsvg-convert / magick for SVG.
#
# Usage:
#   bash task/icons.sh

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
VIEW="$ROOT/view"
OUT="$ROOT/base/code/assets"

mkdir -p "$OUT"

# ── Pick source ──────────────────────────────────────────
SRC_SVG=""
SRC_PNG=""

if [ -f "$VIEW/mac.svg" ]; then
  SRC_SVG="$VIEW/mac.svg"
  echo "source: $SRC_SVG (vector)"
elif [ -f "$VIEW/mac.png" ]; then
  SRC_PNG="$VIEW/mac.png"
  echo "source: $SRC_PNG (raster)"
else
  echo "ERROR: no source icon at $VIEW/mac.svg or $VIEW/mac.png" >&2
  exit 1
fi

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

# ── Pick rasterizer (SVG only) ───────────────────────────
RASTERIZER=""
if [ -n "$SRC_SVG" ]; then
  if command -v inkscape >/dev/null 2>&1; then
    RASTERIZER="inkscape"
  elif command -v rsvg-convert >/dev/null 2>&1; then
    RASTERIZER="rsvg"
  elif command -v magick >/dev/null 2>&1; then
    RASTERIZER="magick"
  else
    echo "ERROR: no SVG rasterizer found." >&2
    echo "Install one of:" >&2
    echo "  brew install --cask inkscape   (best quality)" >&2
    echo "  brew install librsvg           (good quality)" >&2
    echo "  brew install imagemagick       (acceptable)" >&2
    exit 1
  fi
  echo "rasterizer: $RASTERIZER"
fi

# ── Render exactly one PNG at a target size ──────────────
# For SVG: directly rasterize at that size (best quality).
# For PNG: downscale from the source.
render_size() {
  local size="$1"
  local out_file="$2"

  if [ -n "$SRC_SVG" ]; then
    case "$RASTERIZER" in
      inkscape)
        # Inkscape 1.x CLI. --export-background-opacity=0 keeps
        # transparency; --export-png-color-mode=RGBA_8 is the
        # default but explicit.
        inkscape \
          --export-type=png \
          --export-filename="$out_file" \
          --export-width="$size" \
          --export-height="$size" \
          --export-background-opacity=0 \
          "$SRC_SVG" >/dev/null 2>&1
        ;;
      rsvg)
        rsvg-convert \
          -w "$size" \
          -h "$size" \
          --keep-aspect-ratio \
          --background-color=none \
          -o "$out_file" \
          "$SRC_SVG"
        ;;
      magick)
        # ImageMagick with RSVG delegate. -density scales the
        # internal rasterization grid; set high so vector
        # detail isn't lost before resize.
        magick \
          -background none \
          -density 1200 \
          "$SRC_SVG" \
          -resize "${size}x${size}" \
          -colorspace sRGB \
          -define png:color-type=6 \
          "$out_file"
        ;;
    esac
  else
    # Raster source — downscale via sips (CoreGraphics,
    # high quality). For PNG masters use a ≥1024 source.
    sips -z "$size" "$size" "$SRC_PNG" --out "$out_file" >/dev/null
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
iconutil -c icns "$ICONSET" -o "$OUT/icon.icns"
echo "wrote: $OUT/icon.icns ($(du -h "$OUT/icon.icns" | cut -f1))"

# ── Windows .ico ─────────────────────────────────────────
if command -v magick >/dev/null 2>&1; then
  ICO_DIR="$TMP/ico"
  mkdir "$ICO_DIR"
  for s in 16 20 24 32 40 48 64 96 128 256; do
    render_size "$s" "$ICO_DIR/$s.png"
  done
  # Assemble the multi-size .ico. -compress zip keeps
  # the 256 entry PNG-compressed instead of raw bitmap,
  # so the file stays small.
  magick \
    "$ICO_DIR/16.png" "$ICO_DIR/20.png" "$ICO_DIR/24.png" \
    "$ICO_DIR/32.png" "$ICO_DIR/40.png" "$ICO_DIR/48.png" \
    "$ICO_DIR/64.png" "$ICO_DIR/96.png" "$ICO_DIR/128.png" \
    "$ICO_DIR/256.png" \
    -colors 256 \
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

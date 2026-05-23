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
# For SVG large sizes (≥256): the high-quality pipeline.
#   1. Inkscape renders at 4096×4096 (4× oversample so the
#      vector data anti-aliases generously into each pixel).
#   2. magick downscales to the target with Lanczos.
#   3. Adds very subtle gaussian noise (-attenuate 0.3)
#      to break 8-bit quantization bands. The noise is
#      below the eye's threshold at viewing distance but
#      kills the bands.
#   4. Outputs 8-bit PNG. (PNG48 / 16-bit would eliminate
#      banding without noise but most icon formats and
#      viewers strip to 8-bit anyway.)
# For SVG small sizes (<256): direct rasterize is fine.
# For PNG input: downscale via sips.
render_size() {
  local size="$1"
  local out_file="$2"

  if [ -n "$SRC_SVG" ]; then
    local deep_pipeline="false"
    if [ "$size" -ge 256 ]; then
      deep_pipeline="true"
    fi

    # Oversample factor for the deep pipeline. Larger =
    # cleaner gradient (more subpixels averaged per output
    # pixel) but exponentially slower. 4× is the sweet spot.
    local oversample=4

    case "$RASTERIZER" in
      inkscape)
        if [ "$deep_pipeline" = "true" ] && command -v magick >/dev/null 2>&1; then
          local big_size=$((size * oversample))
          local tmp_big="${out_file}.big.png"
          inkscape \
            --export-type=png \
            --export-filename="$tmp_big" \
            --export-width="$big_size" \
            --export-height="$big_size" \
            --export-background-opacity=0 \
            "$SRC_SVG" >/dev/null 2>&1
          # Downscale with Lanczos + add very subtle gaussian
          # noise (-attenuate 0.3) to break 8-bit gradient
          # banding. Noise is far below visibility but kills
          # bands more cleanly than Floyd-Steinberg dither.
          # Linear-RGB downscale + Riemersma dither is the
          # smoothest 8-bit output any pipeline can produce.
          # Visible bands from here are 8-bit display
          # limitation, not file artifacts.
          magick "$tmp_big" \
            -colorspace RGB \
            -filter Lanczos \
            -resize "${size}x${size}" \
            -colorspace sRGB \
            -dither Riemersma \
            -depth 8 \
            -strip \
            "$out_file"
          rm -f "$tmp_big"
        else
          inkscape \
            --export-type=png \
            --export-filename="$out_file" \
            --export-width="$size" \
            --export-height="$size" \
            --export-background-opacity=0 \
            "$SRC_SVG" >/dev/null 2>&1
        fi
        ;;
      rsvg)
        if [ "$deep_pipeline" = "true" ] && command -v magick >/dev/null 2>&1; then
          local big_size=$((size * oversample))
          local tmp_big="${out_file}.big.png"
          rsvg-convert \
            -w "$big_size" \
            -h "$big_size" \
            --keep-aspect-ratio \
            --background-color=none \
            -o "$tmp_big" \
            "$SRC_SVG"
          # Linear-RGB downscale + Riemersma dither is the
          # smoothest 8-bit output any pipeline can produce.
          # Visible bands from here are 8-bit display
          # limitation, not file artifacts.
          magick "$tmp_big" \
            -colorspace RGB \
            -filter Lanczos \
            -resize "${size}x${size}" \
            -colorspace sRGB \
            -dither Riemersma \
            -depth 8 \
            -strip \
            "$out_file"
          rm -f "$tmp_big"
        else
          rsvg-convert \
            -w "$size" \
            -h "$size" \
            --keep-aspect-ratio \
            --background-color=none \
            -o "$out_file" \
            "$SRC_SVG"
        fi
        ;;
      magick)
        if [ "$deep_pipeline" = "true" ]; then
          local big_size=$((size * oversample))
          magick \
            -background none \
            -density 2400 \
            "$SRC_SVG" \
            -resize "${big_size}x${big_size}" \
            -colorspace RGB \
            -filter Lanczos \
            -resize "${size}x${size}" \
            -colorspace sRGB \
            -dither Riemersma \
            -depth 8 \
            -strip \
            "$out_file"
        else
          magick \
            -background none \
            -density 1200 \
            "$SRC_SVG" \
            -resize "${size}x${size}" \
            -colorspace sRGB \
            "$out_file"
        fi
        ;;
    esac
  else
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

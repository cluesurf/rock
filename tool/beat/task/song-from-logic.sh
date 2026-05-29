#!/usr/bin/env bash
#
# song-from-logic
#
# Turn a WAV exported from Logic Pro (with markers) into a beat
# import bundle: a sections JSON sidecar plus a mobile-optimized
# MP3. Run it on the bounced WAV, then AirDrop both outputs to
# the phone and import with the "+ Import song" button.
#
#   task/song-from-logic.sh ~/Desktop/CodeLink.wav "Code Link"
#
# Logic writes section names as WAV cue markers. afinfo reads
# them (ffprobe does not read WAV cues reliably). Frame
# positions are converted to milliseconds with the file's
# sample rate. Markers named "Tempo: ..." are Logic tempo
# markers, not sections, so they are dropped.
#
# Requires: afinfo (macOS), ffmpeg.

set -euo pipefail

# --- mobile-optimized MP3 settings (tweak as desired) ---------
# Stereo 128k at 44.1kHz is ~50x smaller than a 24-bit WAV while
# keeping the mix legible. For an even smaller reference track,
# set CHANNELS=1 and BITRATE=96k.
BITRATE="128k"
SAMPLE_RATE_OUT="44100"
CHANNELS="2"
# EBU R128 loudness normalization target, so every song lands at
# the same perceived volume regardless of how it was exported.
# I is integrated loudness (LUFS), TP true peak (dBTP), LRA range.
LOUDNORM="loudnorm=I=-16:TP=-1.5:LRA=11"
# --------------------------------------------------------------

if [ "$#" -lt 1 ]; then
  echo "usage: song-from-logic.sh <song.wav> [song name]" >&2
  exit 1
fi

WAV="$1"
if [ ! -f "$WAV" ]; then
  echo "no such file: $WAV" >&2
  exit 1
fi

command -v afinfo >/dev/null 2>&1 || { echo "afinfo not found (macOS only)" >&2; exit 1; }
command -v ffmpeg >/dev/null 2>&1 || { echo "ffmpeg not found (brew install ffmpeg)" >&2; exit 1; }

BASE="${WAV%.*}"
NAME="${2:-$(basename "$BASE")}"
MP3="${BASE}.mp3"
JSON="${BASE}.sections.json"

# 1. Markers -> sections JSON.
#    Parse afinfo output: sample rate, duration, and each
#    section marker (frame + label). Convert frames to ms, sort
#    by position, and set each endMs to the next section's start
#    (the last runs to the song's end).
afinfo "$WAV" | awk -v name="$NAME" -v audio="$(basename "$MP3")" '
  /Data format/ {
    if (match($0, /[0-9]+ Hz/)) {
      hz = substr($0, RSTART, RLENGTH); sub(/ Hz/, "", hz); rate = hz + 0
    }
  }
  /estimated duration/ { dur = $3 + 0 }
  /^[[:space:]]*marker [0-9]+,/ {
    q1 = index($0, "\"")
    rest = substr($0, q1 + 1)
    q2 = index(rest, "\"")
    label = substr(rest, 1, q2 - 1)
    fpos = index($0, "frame")
    frame = substr($0, fpos + 5) + 0
    if (label !~ /^Tempo/) { n++; labels[n] = label; frames[n] = frame }
  }
  END {
    # insertion sort by frame
    for (i = 2; i <= n; i++) {
      fk = frames[i]; lk = labels[i]; j = i - 1
      while (j >= 1 && frames[j] > fk) {
        frames[j + 1] = frames[j]; labels[j + 1] = labels[j]; j--
      }
      frames[j + 1] = fk; labels[j + 1] = lk
    }
    durms = int(dur * 1000 + 0.5)
    printf "{\n  \"name\": \"%s\",\n  \"audio\": \"%s\",\n  \"sections\": [\n", name, audio
    for (i = 1; i <= n; i++) {
      startms = int(frames[i] / rate * 1000 + 0.5)
      endms = (i < n) ? int(frames[i + 1] / rate * 1000 + 0.5) : durms
      sep = (i < n) ? "," : ""
      printf "    { \"name\": \"%s\", \"startMs\": %d, \"endMs\": %d }%s\n", label_out(labels[i]), startms, endms, sep
    }
    printf "  ]\n}\n"
  }
  # escape backslashes and quotes for JSON
  function label_out(s) { gsub(/\\/, "\\\\", s); gsub(/"/, "\\\"", s); return s }
' > "$JSON"

SECTION_COUNT=$(grep -c '"startMs"' "$JSON" || true)

# 2. Mobile-optimized MP3 from the WAV. Strip metadata, the
#    sections live in the JSON.
ffmpeg -y -loglevel error -i "$WAV" \
  -af "$LOUDNORM" \
  -ac "$CHANNELS" -ar "$SAMPLE_RATE_OUT" -b:a "$BITRATE" \
  -map_metadata -1 "$MP3"

echo "wrote:"
echo "  $JSON  ($SECTION_COUNT sections)"
echo "  $MP3   ($(du -h "$MP3" | cut -f1), from $(du -h "$WAV" | cut -f1) wav)"
echo "AirDrop both to the phone, then import with + Import song."

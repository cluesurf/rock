#!/usr/bin/env bash
# Release Rock.app to GitHub Releases + Homebrew tap.
# Uses a fine-grained PAT + curl. No gh CLI, no broad
# OAuth scopes.
#
# What it does:
#   1. Reads version from base/package.json.
#   2. Builds Rock.app + .dmg + .zip via electron-builder.
#   3. POSTs a Release to cluesurf/rock via the GitHub API.
#   4. Uploads .dmg / .zip / .blockmap / latest-mac.yml.
#   5. Clones / pulls the homebrew-tool tap, rewrites
#      Casks/rock.rb with new version + sha256, commits,
#      pushes (git over HTTPS, auth via the same PAT).
#   6. Prints the install command.
#
# ── One-time setup ──────────────────────────────────────
#
# Create a fine-grained PAT at:
#
#   https://github.com/settings/personal-access-tokens/new
#
# Settings:
#   Resource owner:    cluesurf
#   Repository access: "Only select repositories" →
#                        cluesurf/rock
#                        cluesurf/homebrew-tool
#   Permissions (Repository):
#                        Contents: Read and write
#                        Metadata: Read (auto)
#                        (everything else: No access)
#
# Save the token in `rock/.env` (gitignored):
#
#   GITHUB_REPO_TOKEN=github_pat_xxxxxxxxxxxxxxxxx
#
# That's the only credential needed. Revoke or rotate any
# time from the same GitHub settings page.
#
# ── Env vars ────────────────────────────────────────────
#
#   GITHUB_REPO_TOKEN    required — read from rock/.env or shell env
#   ROCK_VERSION         override version (default: from package.json)
#   ROCK_REPO            release repo (default: cluesurf/rock)
#   ROCK_TAP_REPO        tap repo (default: cluesurf/homebrew-tool)
#   ROCK_TAP_DIR         local tap clone (default: ~/.cache/rock-tap)
#   ROCK_SKIP_BUILD=1    skip the build step
#   ROCK_SKIP_RELEASE=1  skip the GitHub Release step
#   ROCK_SKIP_CASK=1     skip the cask update step
#
# Usage:
#   pnpm ship

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BASE="$ROOT/base"
DIST="$BASE/dist"

# Progress logger: prints a timestamped step header so any
# hang in the pipeline is obvious. Run via `step "label"`.
step() {
  printf "\n── %s  [%s]\n" "$1" "$(date '+%H:%M:%S')"
}

# curl with sane timeouts. Large .dmg uploads can take
# minutes on slow connections, so the hard timeout is 30
# minutes. Stall detection kicks in if throughput drops
# below 1KB/s for 30 seconds — that's a real hang, fail
# fast. --connect-timeout 10 keeps initial connect snappy.
ghcurl() {
  curl --max-time 1800 \
       --connect-timeout 10 \
       --speed-time 30 \
       --speed-limit 1024 \
       "$@"
}

# Load rock/.env into the shell environment. The file is
# parsed as KEY=value lines (the common dotenv shape).
# Lines starting with # are ignored. Values can be quoted
# but don't have to be.
load_env_file() {
  local file="$1"
  [ -f "$file" ] || return 0
  set -a
  # shellcheck disable=SC1090
  source "$file"
  set +a
}
load_env_file "$ROOT/.env"

REPO="${ROCK_REPO:-cluesurf/rock}"
TAP_REPO="${ROCK_TAP_REPO:-cluesurf/homebrew-tool}"
TAP_DIR="${ROCK_TAP_DIR:-$HOME/.cache/rock-tap}"
VERSION="${ROCK_VERSION:-$(node -p "require('$BASE/package.json').version")}"
API="https://api.github.com"
UPLOAD_API="https://uploads.github.com"

if [ -z "$VERSION" ] || [ "$VERSION" = "0.0.0" ]; then
  echo "ERROR: version is $VERSION. Bump base/package.json first." >&2
  exit 1
fi

TAG="v$VERSION"

echo "── ship Rock.app $TAG ──"
echo "repo:    $REPO"
echo "tap:     $TAP_REPO  ($TAP_DIR)"

step "verify token"
TOKEN="${GITHUB_REPO_TOKEN:-}"
if [ -z "$TOKEN" ]; then
  echo "ERROR: GITHUB_REPO_TOKEN missing." >&2
  echo "Add it to $ROOT/.env:" >&2
  echo "  GITHUB_REPO_TOKEN=github_pat_xxxxxxxxxxxxxxxxx" >&2
  echo "See the setup section at the top of this script." >&2
  exit 1
fi

# Quick token check via /user (works for any repo-scoped PAT).
HTTP_CODE=$(ghcurl -s -o /dev/null -w '%{http_code}' \
  -H "Authorization: Bearer $TOKEN" \
  -H "Accept: application/vnd.github+json" \
  "$API/user")
if [ "$HTTP_CODE" != "200" ]; then
  echo "ERROR: token rejected by GitHub (HTTP $HTTP_CODE)." >&2
  echo "Check GITHUB_REPO_TOKEN in $ROOT/.env." >&2
  exit 1
fi

# ── Build ────────────────────────────────────────────────
if [ "${ROCK_SKIP_BUILD:-0}" != "1" ]; then
  step "build Rock.app (this is slow — 30s+ for electron-builder)"
  (cd "$ROOT" && pnpm package:mac)
fi

# Resolve built artifact names (electron-builder names them
# differently between versions; probe).
DMG="$(ls "$DIST"/Rock-*"$VERSION"*.dmg 2>/dev/null | head -1 || true)"
ZIP="$(ls "$DIST"/Rock-*"$VERSION"*mac.zip 2>/dev/null | head -1 || true)"
BLOCKMAP="$(ls "$DIST"/Rock-*"$VERSION"*mac.zip.blockmap 2>/dev/null | head -1 || true)"
YML="$DIST/latest-mac.yml"
[ -f "$YML" ] || YML=""

if [ -z "$DMG" ] || [ ! -f "$DMG" ]; then
  echo "ERROR: built .dmg not found in $DIST/" >&2
  ls "$DIST" 2>&1 | head -20
  exit 1
fi
if [ -z "$ZIP" ] || [ ! -f "$ZIP" ]; then
  echo "ERROR: built .zip not found in $DIST/" >&2
  exit 1
fi

echo "dmg:  $DMG"
echo "zip:  $ZIP"
[ -n "$BLOCKMAP" ] && echo "map:  $BLOCKMAP"
[ -n "$YML" ] && echo "yml:  $YML"

SHA256="$(shasum -a 256 "$ZIP" | awk '{print $1}')"
echo "sha256: $SHA256"

# ── GitHub Release ───────────────────────────────────────
if [ "${ROCK_SKIP_RELEASE:-0}" != "1" ]; then
  step "github release"

  # Push the git tag if absent.
  if ! git -C "$ROOT" rev-parse "$TAG" >/dev/null 2>&1; then
    git -C "$ROOT" tag -a "$TAG" -m "Rock $VERSION"
    git -C "$ROOT" push origin "$TAG"
  fi

  # Look up or create the release.
  RELEASE_JSON="$(ghcurl -s \
    -H "Authorization: Bearer $TOKEN" \
    -H "Accept: application/vnd.github+json" \
    "$API/repos/$REPO/releases/tags/$TAG")"
  RELEASE_ID="$(node -e "
    try { const r = JSON.parse(process.argv[1]); console.log(r.id || '') }
    catch { console.log('') }
  " "$RELEASE_JSON")"

  if [ -z "$RELEASE_ID" ]; then
    echo "creating release $TAG"
    BODY=$(node -e "console.log(JSON.stringify({
      tag_name: '$TAG',
      name: 'Rock $VERSION',
      body: 'Rock $VERSION.',
      draft: false,
      prerelease: false
    }))")
    RELEASE_JSON="$(ghcurl -s -X POST \
      -H "Authorization: Bearer $TOKEN" \
      -H "Accept: application/vnd.github+json" \
      -d "$BODY" \
      "$API/repos/$REPO/releases")"
    RELEASE_ID="$(node -e "
      const r = JSON.parse(process.argv[1])
      if (!r.id) { console.error('release create failed:', r.message); process.exit(1) }
      console.log(r.id)
    " "$RELEASE_JSON")"
  else
    echo "release $TAG already exists (id=$RELEASE_ID)"
  fi

  # Upload assets. The API lets you delete an asset by id;
  # we delete-then-create to make the script idempotent.
  upload_asset() {
    local file="$1"
    local name; name="$(basename "$file")"
    local mime; mime="$(file --mime-type -b "$file")"

    # Delete existing asset with the same name, if any.
    local assets_json
    assets_json="$(ghcurl -s \
      -H "Authorization: Bearer $TOKEN" \
      -H "Accept: application/vnd.github+json" \
      "$API/repos/$REPO/releases/$RELEASE_ID/assets")"
    local existing_id
    existing_id="$(node -e "
      const list = JSON.parse(process.argv[1])
      const found = list.find(a => a.name === process.argv[2])
      console.log(found ? found.id : '')
    " "$assets_json" "$name")"
    if [ -n "$existing_id" ]; then
      ghcurl -s -X DELETE \
        -H "Authorization: Bearer $TOKEN" \
        "$API/repos/$REPO/releases/assets/$existing_id" >/dev/null
    fi

    local size_mb; size_mb="$(du -m "$file" | cut -f1)"
    echo "  uploading $name (${size_mb} MB, $mime)"
    # --progress-bar shows a live progress bar so the user
    # sees the upload moving instead of staring at a frozen
    # line. ghcurl handles the timeouts.
    ghcurl --progress-bar --no-buffer -X POST \
      -H "Authorization: Bearer $TOKEN" \
      -H "Content-Type: $mime" \
      --data-binary "@$file" \
      "$UPLOAD_API/repos/$REPO/releases/$RELEASE_ID/assets?name=$name" \
      >/dev/null
  }

  upload_asset "$DMG"
  upload_asset "$ZIP"
  [ -n "$BLOCKMAP" ] && [ -f "$BLOCKMAP" ] && upload_asset "$BLOCKMAP"
  [ -n "$YML" ] && [ -f "$YML" ] && upload_asset "$YML"
fi

# ── Homebrew cask update ─────────────────────────────────
if [ "${ROCK_SKIP_CASK:-0}" != "1" ]; then
  step "update homebrew cask"

  # Clone or refresh the tap. Use the PAT for both clone
  # and push so no credential helper is touched.
  REMOTE="https://x-access-token:$TOKEN@github.com/$TAP_REPO.git"
  if [ ! -d "$TAP_DIR/.git" ]; then
    echo "cloning $TAP_REPO into $TAP_DIR"
    mkdir -p "$(dirname "$TAP_DIR")"
    git clone --quiet "$REMOTE" "$TAP_DIR"
  else
    git -C "$TAP_DIR" remote set-url origin "$REMOTE"
    git -C "$TAP_DIR" fetch --quiet origin
    # Use the remote's recorded default branch (origin/HEAD)
    # so this works for any naming convention — main, master,
    # make, trunk, etc. The ClueSurf tap uses `make`, which
    # the old main-or-master fallback chain didn't cover.
    TAP_BRANCH="$(git -C "$TAP_DIR" symbolic-ref --short refs/remotes/origin/HEAD 2>/dev/null | sed 's@^origin/@@')"
    if [ -z "$TAP_BRANCH" ]; then
      # origin/HEAD wasn't recorded locally; ask the remote.
      git -C "$TAP_DIR" remote set-head origin -a >/dev/null 2>&1 || true
      TAP_BRANCH="$(git -C "$TAP_DIR" symbolic-ref --short refs/remotes/origin/HEAD 2>/dev/null | sed 's@^origin/@@')"
    fi
    TAP_BRANCH="${TAP_BRANCH:-main}"
    git -C "$TAP_DIR" checkout --quiet "$TAP_BRANCH"
    git -C "$TAP_DIR" pull --ff-only --quiet
  fi

  CASK="$TAP_DIR/Casks/rock.rb"
  if [ ! -f "$CASK" ]; then
    echo "ERROR: cask not found at $CASK" >&2
    exit 1
  fi

  ZIP_BASENAME="$(basename "$ZIP")"
  ZIP_URL="https://github.com/$REPO/releases/download/$TAG/$ZIP_BASENAME"

  TMP="$(mktemp)"
  # Match `version|sha256|url` at the start of a directive
  # regardless of value format. Handles both `sha256 "..."`
  # and `sha256 :no_check` (Ruby symbol). The substitution
  # always writes the quoted-string form so future runs are
  # consistent.
  awk -v ver="$VERSION" -v sha="$SHA256" -v url="$ZIP_URL" '
    /^[[:space:]]*version[[:space:]]/ { sub(/version[[:space:]].*$/, "version \"" ver "\""); print; next }
    /^[[:space:]]*sha256[[:space:]]/  { sub(/sha256[[:space:]].*$/,  "sha256 \""  sha "\""); print; next }
    /^[[:space:]]*url[[:space:]]/     { sub(/url[[:space:]].*$/,     "url \""     url "\""); print; next }
    { print }
  ' "$CASK" > "$TMP"
  mv "$TMP" "$CASK"

  if git -C "$TAP_DIR" diff --quiet "$CASK"; then
    echo "cask already up to date"
  else
    git -C "$TAP_DIR" commit -am "rock $VERSION"
    git -C "$TAP_DIR" push --quiet origin HEAD
  fi
fi

# Done.
echo
echo "── done ──"
echo "Rock $VERSION shipped."
echo
echo "Users install with:"
echo "  brew tap cluesurf/tool"
echo "  brew install --cask cluesurf/tool/rock"
echo
echo "Existing users upgrade with:"
echo "  brew upgrade cluesurf/tool/rock"

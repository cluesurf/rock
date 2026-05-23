# Release flow

How to ship a new version of Rock.app to Homebrew users.

---

## What gets published

| Artifact | Where | Consumed by |
|---|---|---|
| `Rock-{version}-mac-arm64.dmg` | GitHub Releases | direct download |
| `Rock-{version}-mac.zip` | GitHub Releases | the Homebrew cask |
| `Rock-{version}-mac.zip.blockmap` | GitHub Releases | electron-updater (delta updates) |
| Updated `Casks/rock.rb` | cluesurf/homebrew-tool | `brew upgrade rock` |

---

## One-time setup

```bash
# 1. Code signing (macOS Developer ID)
export APPLE_ID=you@email.com
export APPLE_APP_SPECIFIC_PASSWORD=xxxx-xxxx-xxxx-xxxx
export APPLE_TEAM_ID=ABCDE12345

# 2. GitHub token for the auto-publish step
export GH_TOKEN=ghp_xxxxxxxx

# 3. (One-time) clone the Homebrew tap repo for cask updates
git clone https://github.com/cluesurf/homebrew-tool ~/code/homebrew-tool
```

---

## Per-release workflow

```bash
cd cluesurf/deck/rock

# 1. Bump version in base/package.json
#    "version": "0.1.0"  →  "version": "0.2.0"

# 2. Build + sign + notarize the macOS package
cd base
pnpm package:mac
# Output:
#   dist/Rock-0.2.0-mac-arm64.dmg
#   dist/Rock-0.2.0-mac.zip
#   dist/Rock-0.2.0-mac.zip.blockmap
#   dist/latest-mac.yml

# 3. Upload to a GitHub Release
gh release create v0.2.0 \
  dist/Rock-0.2.0-mac-arm64.dmg \
  dist/Rock-0.2.0-mac.zip \
  dist/Rock-0.2.0-mac.zip.blockmap \
  dist/latest-mac.yml \
  --title "v0.2.0" \
  --notes-file CHANGELOG.md \
  --repo cluesurf/rock

# 4. Update the Homebrew cask
cd ~/code/homebrew-rock
# Edit Casks/rock.rb:
#   version "0.2.0"
#   sha256 "<sha from `shasum -a 256 dist/Rock-0.2.0-mac.zip`>"
git commit -am "rock 0.2.0"
git push

# 5. Done. Users get the update via:
#    brew upgrade rock
# Or auto-update inside the app via electron-updater.
```

---

## Building locally (no publish)

For local testing without uploading:

```bash
cd cluesurf/deck/rock/base
pnpm package:mac
open dist/mac-arm64/Rock.app
```

This produces an unsigned build. macOS Gatekeeper will warn
when you open it the first time; right-click → Open to
override.

---

## Why the build is separate from the dev loop

`pnpm dev` and `pnpm start` use Electron's dev binary, so
the app shows as "Electron" in Cmd+Tab. That's a development
constraint, not a bug.

`pnpm package:mac` produces `Rock.app` — a real macOS bundle
with `productName: Rock` in its Info.plist, the proper icon,
its own Bundle ID. THAT is what shows "Rock" in Cmd+Tab.

To verify branding before shipping:

```bash
pnpm package:mac
open dist/mac-arm64/Rock.app
# ⌘+Tab → should show "Rock" with the rock icon
```

---

## When packaging fails in the workspace

If `pnpm package:mac` errors on pnpm symlinks (electron-builder
doesn't always cope with pnpm's node_modules layout), fall
back to the standalone repo path:

```bash
# Copy base/ to a fresh non-workspace location
rsync -av \
  --exclude=node_modules --exclude=out --exclude=dist \
  cluesurf/deck/rock/base/ ~/code/rock-ship/

cd ~/code/rock-ship
npm install                      # or pnpm without workspace
npm install ../path/to/cluesurf/deck/rock  # or `npm pack && npm install`
npm run package:mac
```

This is the production path. The `cluesurf/deck/rock/base/`
demo stays for development; shipping happens from a clean
standalone project.

---

## Versioning

Semver:
- `0.1.0` → `0.1.1` (patch): bug fix
- `0.1.0` → `0.2.0` (minor): new feature, backward-compat
- `0.1.0` → `1.0.0` (major): breaking change

Bump `base/package.json` "version" field before each release.
The cask's `version` line in `homebrew-tool` must match.

---

## What the release artifacts contain

`Rock-{version}-mac-arm64.dmg`:
- An installer disk image. User mounts → drags Rock.app to
  Applications.

`Rock-{version}-mac.zip`:
- A zipped Rock.app. Smaller than dmg, used by the cask
  (Homebrew prefers zip — easier to verify checksum + extract).

`Rock-{version}-mac.zip.blockmap`:
- A delta file. `electron-updater` uses this to download only
  the changed parts of the .zip when updating.

`latest-mac.yml`:
- Manifest pointing at the current version + checksums.
  `electron-updater` reads this to know when an update exists.

---

## Auto-update (electron-updater)

To wire in-app auto-updates so users don't have to manually
re-download:

```ts
// in base/boot/index.ts (after boot() returns)
import { autoUpdater } from 'electron-updater'

const handle = await boot({ name: 'Rock', workspace })

autoUpdater.checkForUpdatesAndNotify()

autoUpdater.on('update-downloaded', () => {
  // restart prompt; user can install on next launch
})
```

Add `electron-updater` to base/package.json deps. The package
reads the `publish` config from package.json's "build" section.

---

## Related

- Cask formula: `cluesurf/deck/homebrew-rock/Casks/rock.rb`
- Cask artifact host: `cluesurf/deck/homebrew-rock/Tool/rock/`
- Distribution rationale: `cluesurf/note/library/rock/distribution-design.md`

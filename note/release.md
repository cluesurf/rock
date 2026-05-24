# Release

How we cut a new Rock.app release. Everything is automated behind
`pnpm ship`.

## Prerequisites (one-time)

### 1. GitHub fine-grained PAT

Create at https://github.com/settings/personal-access-tokens/new with:

- **Resource owner:** `cluesurf`
- **Repository access:** Only `cluesurf/rock` + `cluesurf/homebrew-tool`
- **Permissions:** Contents: Read and write (everything else: No access)

Save the token in `rock/.env`:

```
GITHUB_REPO_TOKEN=github_pat_xxxxxxxxxxxxxxxxx
```

(`.env` is gitignored.)

That's the only credential needed. Two scopes, two repos.

### 2. Homebrew tap

The cask lives in a separate repo. Clone happens automatically by
`ship.sh` to `~/.cache/rock-tap/`. No manual setup.

## Cut a release

```bash
# 1. Bump version in base/package.json AND package.json
#    (match them — both 0.0.7, say)

# 2. Ship
pnpm ship
```

That does all of:

| Step                                                    | Where                   |
| ------------------------------------------------------- | ----------------------- |
| Build the `.app` + `.dmg` + `.zip` via electron-builder | `base/dist/`            |
| Bundle the `rock` CLI via esbuild                       | `base/dist-cli/rock.js` |
| Push the git tag `v<version>` to `cluesurf/rock`        | git                     |
| Create a GitHub Release with the build artifacts        | GitHub API (curl)       |
| Compute the .zip's sha256                               | `shasum -a 256`         |
| Clone / pull the tap repo                               | `~/.cache/rock-tap/`    |
| Rewrite `Casks/rock.rb` with new version + sha + URL    | awk                     |
| Commit + push the cask update                           | git over HTTPS w/ PAT   |

When it's done, end users get the update via:

```bash
brew upgrade --cask cluesurf/tool/rock
```

## Scripts

| Command               | What                                         |
| --------------------- | -------------------------------------------- |
| `pnpm ship`           | full release pipeline                        |
| `pnpm ship:cask-only` | already-built `dist/`, just refresh the cask |
| `pnpm ship:dry`       | print version + plan without doing anything  |

Env vars for skipping steps (also docs at the top of `task/ship.sh`):

```
ROCK_SKIP_BUILD=1     skip the build step
ROCK_SKIP_RELEASE=1   skip the GitHub Release step
ROCK_SKIP_CASK=1      skip the cask update step
```

## Versioning

Semver. Bump both:

- `base/package.json` `version` (electron-builder reads this)
- `package.json` `version` (lib, npm publish reads this)

Keep them in lockstep so the CLI's printed version matches the .app's.

For `pnpm publish` of the lib (`@cluesurf/rock`):

```bash
pnpm release:patch   # 0.0.7 → 0.0.8
pnpm release:minor   # 0.0.7 → 0.1.0
pnpm release:major   # 0.0.7 → 1.0.0
```

(Each runs `pnpm version`, then `pnpm publish:npm`.)

## What gets shipped

### To GitHub Releases

| Asset                               | What                                        |
| ----------------------------------- | ------------------------------------------- |
| `Rock-X.Y.Z-arm64.dmg`              | macOS arm64 disk image (direct download UX) |
| `Rock-X.Y.Z.dmg`                    | macOS x64 disk image                        |
| `Rock-X.Y.Z-arm64-mac.zip`          | arm64 .app zipped (cask consumes this)      |
| `Rock-X.Y.Z-mac.zip`                | x64 .app zipped                             |
| `Rock-X.Y.Z-arm64-mac.zip.blockmap` | electron-updater delta map                  |
| `latest-mac.yml`                    | electron-updater manifest                   |

### To the tap repo

A single commit to `cluesurf/homebrew-tool` updating `Casks/rock.rb`'s
`version`, `sha256`, and `url` lines.

### To npm

`pnpm release:*` publishes `@cluesurf/rock` (the library) to npm.
Independent of the .app release — only do this when the library API
changes.

## Code signing (not yet)

Currently Rock ships **ad-hoc signed** (no Apple Developer ID). The
cask's `postflight` strips the `com.apple.quarantine` attribute on
install so Gatekeeper doesn't block first launch.

Once we have an Apple Developer ID:

1. `APPLE_ID=you@email.com APPLE_APP_SPECIFIC_PASSWORD=xxxx-xxxx-xxxx-xxxx APPLE_TEAM_ID=ABCDE12345`
   in `rock/.env`
2. electron-builder picks them up automatically — signs
   - notarizes during `pnpm ship`
3. Drop the cask's `postflight` block

## What to do if a release breaks halfway

`ship.sh` is idempotent:

- Tag already pushed → skipped on re-run
- Release exists → existing assets re-uploaded (deleted + re-POSTed so
  partial uploads are replaced cleanly)
- Cask already at the same version → no commit

So if a network blip kills an upload mid-flight, just re-run `pnpm ship`
and it finishes what's left.

If the .app is broken (bad code shipped), bump the version and ship
again. Don't try to re-upload to the same release — users may have
already downloaded the broken artifact.

## Brand-new machine release setup

```bash
brew install gh                  # NOT used; just for reference
# (we use a PAT + curl, not gh CLI — fewer scopes)

echo 'GITHUB_REPO_TOKEN=ghp_...' > .env
chmod 600 .env

pnpm install
pnpm ship   # first release from this machine
```

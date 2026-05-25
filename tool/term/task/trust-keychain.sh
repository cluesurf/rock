#!/usr/bin/env bash
# trust-keychain.sh — pre-create Term's "Safe Storage"
# keychain item with a permissive ACL so unsigned dev
# builds stop prompting for the login password every time
# the .app boots.
#
# Why this is needed:
#
#   Electron's `safeStorage` API (used internally for
#   session cookie encryption etc.) creates a generic
#   password item in the macOS Keychain named
#   "<AppName> Safe Storage" the first time the app runs.
#   macOS guards that item with an ACL: only the exact
#   code-signing identity that created it can read it
#   without re-prompting. Unsigned dev builds get a NEW
#   code identity hash every rebuild, so "Always Allow"
#   only lasts until the next `pnpm verify`.
#
#   This script creates the item with `-A` (trust all
#   apps), which suppresses the ACL prompt entirely. The
#   next boot finds the existing item and uses it.
#
#   When Term.app is properly Developer-ID-signed +
#   notarized, this script is no longer needed: the
#   keychain ACL recognizes the stable signing identity.
#
# Run once on a fresh Mac (idempotent — safe to re-run):
#
#     pnpm trust:keychain
#
# To undo:
#
#     security delete-generic-password -s "Term Safe Storage"

set -euo pipefail

ITEM="Term Safe Storage"

# Wipe any existing item first. If a stale item with a
# restrictive ACL is in the keychain (from a prior build
# hash), Electron will keep prompting to overwrite it.
# Deleting + recreating with -A is the only way to get a
# truly permissive item.
echo "Removing any existing '$ITEM' keychain item..."
security delete-generic-password -s "$ITEM" >/dev/null 2>&1 || true

# Create with -A (allow any application without ACL
# prompt). Random initial password; Electron may overwrite
# with its real encryption key on first boot, but the -A
# ACL persists across the overwrite.
PLACEHOLDER="$(openssl rand -base64 32)"

security add-generic-password \
  -a "Term" \
  -s "$ITEM" \
  -w "$PLACEHOLDER" \
  -A \
  -D "application password" \
  -j "Term dev-build placeholder"

echo "Created keychain item '$ITEM' with permissive ACL."
echo
echo "Note: as of the latest Term build, this script is no longer"
echo "strictly necessary — Term's main process now disables cookie"
echo "encryption (\`disable-features=CookieEncryption\`), so the"
echo "keychain is never touched at boot. Keeping this script as a"
echo "fallback for older builds or other Electron apps in the family."

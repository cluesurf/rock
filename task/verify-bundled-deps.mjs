// SPDX-License-Identifier: GPL-3.0-or-later

// Static import-resolution check for a packaged Rock.app.
//
// Reads make/main/*.js out of the .app's app.asar, finds
// every bare import specifier, and verifies each one
// resolves to either:
//   - a Node built-in
//   - a package present inside app.asar/node_modules
//   - a package present inside app.asar.unpacked/node_modules
//
// Exits non-zero with the list of missing packages if any
// import would fail at runtime. Catches the class of
// "added peer dep, forgot to copy it into the .app" bugs
// that the boot-smoke test misses when Electron pops a
// native error dialog instead of writing to stderr.
//
// Usage:
//   node task/verify-bundled-deps.mjs /path/to/Rock.app

import { existsSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { builtinModules } from 'node:module'
import asar from '@electron/asar'

const APP = process.argv[2]
if (!APP) {
  console.error('usage: node verify-bundled-deps.mjs <Rock.app>')
  process.exit(2)
}

const ASAR = join(APP, 'Contents/Resources/app.asar')
const UNPACKED = join(APP, 'Contents/Resources/app.asar.unpacked')

if (!existsSync(ASAR)) {
  console.error(`FAIL: no app.asar at ${ASAR}`)
  process.exit(1)
}

// 1. Build the set of packages available to the runtime.
const available = new Set(builtinModules)
for (const b of builtinModules) available.add(`node:${b}`)
// Electron-provided modules. Not in builtinModules but
// always resolvable from the main process.
for (const e of ['electron']) available.add(e)

const collectFromNodeModules = (root) => {
  if (!existsSync(root)) return
  for (const ent of readdirSync(root)) {
    if (ent.startsWith('.')) continue
    if (ent.startsWith('@')) {
      const scoped = join(root, ent)
      if (!statSync(scoped).isDirectory()) continue
      for (const sub of readdirSync(scoped)) {
        if (sub.startsWith('.')) continue
        available.add(`${ent}/${sub}`)
      }
    } else {
      available.add(ent)
    }
  }
}

// Packages inside the asar.
for (const file of asar.listPackage(ASAR)) {
  const m = file.match(/^[\\/]node_modules[\\/](@[^\\/]+[\\/][^\\/]+|[^\\/]+)(?:[\\/]|$)/)
  if (m) available.add(m[1])
}
// Packages unpacked alongside the asar.
collectFromNodeModules(join(UNPACKED, 'node_modules'))

// 2. Parse make/main/*.js for bare import specifiers.
const mainFiles = asar
  .listPackage(ASAR)
  .filter((f) => /^[\\/]make[\\/]main[\\/].*\.(?:m?js|cjs)$/.test(f))

if (mainFiles.length === 0) {
  console.error('FAIL: no make/main/*.js files found inside app.asar')
  process.exit(1)
}

const importRegex =
  /(?:^|\n|;)\s*(?:import\s+[^'"]*from\s+|import\s+|export\s+[^'"]*from\s+)['"]([^'"]+)['"]/g
const requireRegex = /\brequire\(\s*['"]([^'"]+)['"]\s*\)/g

const seen = new Set()
const missing = []

for (const file of mainFiles) {
  const src = asar.extractFile(ASAR, file.replace(/^[\\/]/, '')).toString('utf8')
  const specifiers = []
  for (const m of src.matchAll(importRegex)) specifiers.push(m[1])
  for (const m of src.matchAll(requireRegex)) specifiers.push(m[1])
  for (const spec of specifiers) {
    if (!spec) continue
    if (spec.startsWith('.') || spec.startsWith('/')) continue
    const pkg = spec.startsWith('@')
      ? spec.split('/').slice(0, 2).join('/')
      : spec.split('/')[0]
    if (!pkg) continue
    if (seen.has(pkg)) continue
    seen.add(pkg)
    if (available.has(pkg)) continue
    missing.push({ specifier: spec, pkg, file })
  }
}

if (missing.length > 0) {
  console.error('FAIL: main-process imports not bundled in the .app:')
  for (const m of missing) {
    console.error(`  - import '${m.specifier}' (package '${m.pkg}') from ${m.file}`)
  }
  console.error('')
  console.error('Fix: add the package to base/package.json "build.files" so')
  console.error('electron-builder copies it into the bundle. Native packages')
  console.error('also need an entry in "build.asarUnpack".')
  process.exit(1)
}

console.log(
  `OK: ${seen.size} unique main-process imports across ${mainFiles.length} files all resolve to bundled modules.`,
)

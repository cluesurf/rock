import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import type { Plugin } from 'vite'
import { resolve, join, extname, sep } from 'node:path'
import { existsSync } from 'node:fs'

/**
 * Vite plugin that owns module resolution for
 *   - `@cluesurf/term`            → ../code/index
 *   - `@cluesurf/term/<subpath>`  → ../code/<subpath>
 *   - `@/<subpath>` from files under ../code/ → ../code/<subpath>
 *
 * Same shape as mesh/site/word.surf/home/vite.config.ts's
 * `workspacePlugin`, scaled down for Term's one-package
 * layout. Owning resolution at the plugin level (instead
 * of relying on Vite's prefix-matching `resolve.alias`)
 * is what makes HMR work for lib edits: imports point at
 * TypeScript source, Vite watches and Fast-Refreshes
 * them like first-party files.
 *
 * Memoizes positive hits; misses are returned but not
 * cached, so adding a new file is picked up on the next
 * import without a server restart.
 */
const RESOLVE_EXTENSIONS = [
  '.tsx',
  '.ts',
  '.jsx',
  '.js',
  '.css',
  '.json',
] as const

const KNOWN_EXTENSIONS = new Set([
  '.tsx',
  '.ts',
  '.jsx',
  '.js',
  '.mjs',
  '.cjs',
  '.css',
  '.json',
])

const resolveCache = new Map<string, string>()

function probe(baseAbsolute: string, subpath: string): string | null {
  const cacheKey = `${baseAbsolute}\0${subpath}`
  const cached = resolveCache.get(cacheKey)
  if (cached !== undefined) return cached

  const full = join(baseAbsolute, subpath)

  // Only short-circuit when the extname is a real module
  // extension. Random dotted filenames need to fall
  // through to the extension probe so `<full>.ts` is
  // tried.
  const ext = extname(subpath)
  if (ext !== '' && KNOWN_EXTENSIONS.has(ext)) {
    if (existsSync(full)) {
      resolveCache.set(cacheKey, full)
      return full
    }
    return null
  }

  for (const e of RESOLVE_EXTENSIONS) {
    const candidate = `${full}${e}`
    if (existsSync(candidate)) {
      resolveCache.set(cacheKey, candidate)
      return candidate
    }
  }

  const indexBase = join(full, 'index')
  for (const e of RESOLVE_EXTENSIONS) {
    const candidate = `${indexBase}${e}`
    if (existsSync(candidate)) {
      resolveCache.set(cacheKey, candidate)
      return candidate
    }
  }

  return null
}

function workspacePlugin(rootDir: string): Plugin {
  const codeRoot = resolve(rootDir, 'code')
  return {
    name: 'term-workspace-resolver',
    enforce: 'pre',
    resolveId(id, importer) {
      // Strip Vite query suffixes (`?url`, `?raw`, etc.)
      // for the filesystem lookup; re-attach when returning.
      const queryAt = id.indexOf('?')
      const query = queryAt >= 0 ? id.slice(queryAt) : ''
      const bareId = queryAt >= 0 ? id.slice(0, queryAt) : id
      const finish = (resolved: string | null) =>
        resolved == null ? null : resolved + query

      // @cluesurf/term + @cluesurf/term/<subpath>
      if (bareId === '@cluesurf/term') {
        return finish(probe(codeRoot, 'index'))
      }
      if (bareId.startsWith('@cluesurf/term/')) {
        const subpath = bareId.slice('@cluesurf/term/'.length)
        return finish(probe(codeRoot, subpath))
      }

      // @/<subpath> — only valid from files inside code/.
      // (base/code/ doesn't declare an @/ alias in its
      // tsconfig.)
      if (!bareId.startsWith('@/') || !importer) return null
      const importerNormalized = importer.split(sep).join('/')
      const codeRootNormalized = codeRoot.split(sep).join('/')
      if (!importerNormalized.startsWith(codeRootNormalized + '/')) {
        return null
      }
      const subpath = bareId.slice('@/'.length)
      return finish(probe(codeRoot, subpath))
    },
  }
}

/**
 * Invalidate stale module-resolution caches when files
 * appear inside the lib's code/ dir. Without this, vite's
 * pluginContainer caches the *negative* resolveId result
 * from before the file existed; you'd add a new file and
 * Vite would keep reporting "Cannot find module" until a
 * full server restart.
 */
function invalidateOnNewFile(rootDir: string): Plugin {
  const codeRoot = resolve(rootDir, 'code')
  return {
    name: 'term-invalidate-on-new-file',
    configureServer(server) {
      const invalidate = () => {
        resolveCache.clear()
        server.moduleGraph.invalidateAll()
      }
      server.watcher.on('add', file => {
        if (file.startsWith(codeRoot)) invalidate()
      })
      server.watcher.on('addDir', dir => {
        if (dir.startsWith(codeRoot)) invalidate()
      })
    },
  }
}

// Native + Electron modules that MUST resolve from
// node_modules at runtime. node-pty's internal loader uses
// relative paths (`'..'` / `'.'`) to find pty.node; if
// node-pty itself is bundled into make/main/index.js those
// paths resolve to base/make/ instead of node_modules/node-pty/
// and pty.node fails to load. better-sqlite3 has the same
// shape. esbuild is a native binary too. electron is
// provided by the runtime.
//
// externalizeDepsPlugin() catches direct dependencies but
// can miss transitive imports through workspace packages
// (@cluesurf/term here), so we list them explicitly too.
const NATIVE_EXTERNALS = [
  'node-pty',
  'better-sqlite3',
  'esbuild',
  'electron',
]

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      outDir: resolve(__dirname, 'make/main'),
      emptyOutDir: true,
      rollupOptions: {
        input: resolve(__dirname, 'boot/index.ts'),
        external: NATIVE_EXTERNALS,
        output: {
          format: 'es',
          entryFileNames: 'index.js',
        },
      },
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      outDir: resolve(__dirname, 'make/preload'),
      emptyOutDir: true,
      rollupOptions: {
        input: resolve(__dirname, 'boot/preload.ts'),
        external: NATIVE_EXTERNALS,
        output: {
          format: 'es',
          entryFileNames: 'index.mjs',
        },
      },
    },
  },
  renderer: {
    root: resolve(__dirname, 'code'),
    plugins: [
      // Workspace resolver runs FIRST (enforce: 'pre') so
      // it can intercept `@cluesurf/term/*` and `@/*`
      // imports before Vite's standard resolution tries
      // to find them inside node_modules/host.
      workspacePlugin(resolve(__dirname, '..')),
      invalidateOnNewFile(resolve(__dirname, '..')),
      react(),
      tailwindcss(),
    ],
    // NEVER auto-open a browser in dev. Electron IS the
    // renderer; a browser tab is at best useless (no
    // preload → `window.app` undefined → crash) and at
    // worst confusing. Pin this off explicitly so a
    // plugin or future config merge can't flip it back.
    server: {
      open: false,
      strictPort: true,
      // Let Vite read source files from the parent dir
      // (../code/**). Default `server.fs.allow` is just
      // the renderer root, which would block the lib.
      fs: {
        allow: [resolve(__dirname, '..')],
      },
    },
    // Pre-bundle npm deps used by the term lib (../code/)
    // explicitly. Without this, vite discovers them lazily
    // at first import — and if the dep was added to
    // package.json mid-`pnpm dev` (after the server was
    // already running), vite caches the failed resolution
    // and the user has to restart the dev server to
    // recover. Listing them here forces vite to pre-bundle
    // them on startup, so as long as they're installed
    // before `pnpm dev` boots, they Just Work.
    optimizeDeps: {
      include: ['fuse.js'],
    },
    build: {
      outDir: resolve(__dirname, 'make/renderer'),
      emptyOutDir: true,
      rollupOptions: {
        input: resolve(__dirname, 'code/index.html'),
      },
    },
  },
})

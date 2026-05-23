import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { resolve } from 'node:path'

// Native + Electron modules that MUST resolve from
// node_modules at runtime. node-pty's internal loader uses
// relative paths (`'..'` / `'.'`) to find pty.node; if
// node-pty itself is bundled into out/main/index.js those
// paths resolve to base/out/ instead of node_modules/node-pty/
// and pty.node fails to load. better-sqlite3 has the same
// shape. esbuild is a native binary too. electron is
// provided by the runtime.
//
// externalizeDepsPlugin() catches direct dependencies but
// can miss transitive imports through workspace packages
// (@cluesurf/rock here), so we list them explicitly too.
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
      outDir: resolve(__dirname, 'out/main'),
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
      outDir: resolve(__dirname, 'out/preload'),
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
    plugins: [react(), tailwindcss()],
    build: {
      outDir: resolve(__dirname, 'out/renderer'),
      emptyOutDir: true,
      rollupOptions: {
        input: resolve(__dirname, 'code/index.html'),
      },
    },
  },
})

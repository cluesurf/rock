import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { resolve } from 'node:path'

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      outDir: resolve(__dirname, 'out/main'),
      emptyOutDir: true,
      rollupOptions: {
        input: resolve(__dirname, 'boot/index.ts'),
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

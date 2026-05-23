import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'node:path'

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      lib: {
        entry: resolve(__dirname, 'boot/main.ts'),
      },
      outDir: 'out/main',
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      lib: {
        entry: resolve(__dirname, 'boot/preload.ts'),
      },
      outDir: 'out/preload',
    },
  },
  renderer: {
    root: resolve(__dirname, 'code'),
    plugins: [react()],
    build: {
      outDir: '../out/renderer',
      rollupOptions: {
        input: resolve(__dirname, 'code/index.html'),
      },
    },
  },
})

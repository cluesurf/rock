/**
 * Vitest config. Tests cover the pure domain logic in
 * code/base (no React Native imports), with the same `@/`
 * path alias the app uses.
 */

import { defineConfig } from 'vitest/config'
import path from 'node:path'

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'code'),
    },
  },
  test: {
    include: ['code/**/*.test.ts'],
  },
})

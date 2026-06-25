import { defineConfig } from 'vitest/config'
import path from 'path'

// Scoped to colocated unit tests under src/. The Playwright e2e specs in e2e/
// are intentionally excluded so the two runners never collide.
export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
  test: {
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    environment: 'node',
  },
})

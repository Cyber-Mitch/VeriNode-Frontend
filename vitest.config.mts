// NOTE: this file was deleted from main in commit 49287e7 ("Remove all test
// files") along with .github/workflows/test.yml, and recovered verbatim from
// git history (87f72ca) while implementing #95. Without it, vitest cannot
// resolve the `@/*` alias and every existing test fails to import. Do not
// delete this file again without restoring an equivalent alias config.
//
// The '@/src' entry was added on top of the recovered version: tsconfig.json
// maps "@/*" to both "./src/*" and "./*", so application code imports under
// both `@/hooks/x` and `@/src/hooks/x` interchangeably (both resolve to the
// same file under TS). The original alias map here only covered the former;
// without '@/src' as a distinct, more specific entry, imports like
// `@/src/hooks/useSlashingStream` resolve to the nonexistent `./src/src/...`.
import { defineConfig } from 'vitest/config'
import path from 'path'

// Scoped to colocated unit tests under src/. The Playwright e2e specs in e2e/
// are intentionally excluded so the two runners never collide. Suites that need
// a DOM opt in per-file via `// @vitest-environment jsdom`.
export default defineConfig({
  resolve: {
    alias: {
      '@/src': path.resolve(__dirname, './src'),
      '@': path.resolve(__dirname, './src'),
      '@/types': path.resolve(__dirname, './src/types'),
      '@/utils': path.resolve(__dirname, './src/utils'),
      '@/services': path.resolve(__dirname, './src/services'),
      '@/hooks': path.resolve(__dirname, './src/hooks'),
      '@/components': path.resolve(__dirname, './src/components'),
      '@/store': path.resolve(__dirname, './src/store'),
    },
  },
  test: {
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    environment: 'node',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary', 'lcov'],
      reportsDirectory: './coverage',
      include: ['src/**/*.{ts,tsx}'],
      exclude: [
        'src/**/*.test.{ts,tsx}',
        'src/**/tests/**',
        'src/**/*.d.ts',
      ],
      thresholds: {
        statements: 70,
        branches: 60,
        functions: 70,
        lines: 70,
      },
    },
  },
})

import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: true,
    include: ['src/**/*.test.{ts,tsx}'],
  },
  resolve: {
    alias: {
      // Mirror the tsconfig "@/*" -> project root mapping so unit tests can
      // import modules the same way the app does (e.g. "@/src/hooks/...").
      '@': fileURLToPath(new URL('./', import.meta.url)),
    },
  },
});

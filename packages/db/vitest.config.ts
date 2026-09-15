import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Only run tests from `src` to avoid duplicate runs from `dist` build artifacts
    include: ['src/**/*.{test,spec}.{ts,tsx,js,mjs,cjs}'],
    exclude: ['dist/**', 'node_modules/**'],
  },
});

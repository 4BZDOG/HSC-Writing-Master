import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  define: {
    // Mirror vite.config.ts so components reading the app version don't hit a
    // bare identifier in the jsdom environment.
    __APP_VERSION__: JSON.stringify('0.0.0-test'),
  },
  test: {
    globals: true,
    environment: 'jsdom',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html', 'lcov'],
      exclude: ['node_modules/', 'dist/', 'tests/', '**/*.d.ts', '**/index.ts', '**/index.tsx'],
      // Regression floor, not an aspiration: set just below measured coverage
      // so CI fails when coverage DROPS, instead of failing every run because
      // the project has never met 70%. Ratchet these up as coverage grows —
      // left at the old 55/50/50/55 they had drifted ~6 points below the real
      // figure, which is enough slack for a whole feature to land untested
      // without the gate noticing.
      // Measured at the time of setting: 61.7 lines / 56.4 functions /
      // 55.7 branches / 60.3 statements.
      thresholds: {
        lines: 60,
        functions: 55,
        branches: 54,
        statements: 59,
      },
    },
    include: ['tests/unit/**/*.{test,spec}.{ts,tsx}'],
    exclude: ['node_modules/', 'dist/', '.idea', '.git', '.cache', 'tests/e2e/**'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './'),
    },
  },
});

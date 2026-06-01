import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html', 'lcov'],
      // Thresholds are enforced against the pure utility modules the unit suite
      // directly covers. Component/hook/service modules need React Testing
      // Library / E2E coverage (tracked as IDEA-06 in ProjectHealth.md) and are
      // intentionally outside the threshold scope until that lands.
      include: [
        'utils/stateUtils.ts',
        'utils/errorHandler.ts',
        'utils/idUtils.ts',
        'utils/dataCloneUtils.ts',
      ],
      exclude: ['node_modules/', 'dist/', 'tests/', '**/*.d.ts', '**/index.ts', '**/index.tsx'],
      thresholds: {
        lines: 70,
        functions: 70,
        branches: 70,
        statements: 70,
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

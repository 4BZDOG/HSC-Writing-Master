/// <reference types="vitest" />
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: [],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html', 'lcov'],
      exclude: ['node_modules/', 'dist/', 'tests/', '**/*.d.ts', '**/index.ts', '**/index.tsx'],
      lines: 70,
      functions: 70,
      branches: 70,
      statements: 70,
    },
    include: ['tests/**/*.{test,spec}.{ts,tsx}'],
    exclude: ['node_modules/', 'dist/', '.idea', '.git', '.cache'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './'),
    },
  },
});

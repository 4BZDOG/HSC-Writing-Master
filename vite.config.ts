import path from 'path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  server: {
    port: 3000,
    host: '0.0.0.0',
  },
  plugins: [react()],
  define: {
    // Only expose VITE_* variables (Vite's secure env approach)
    // API keys should never be in the bundle - use backend proxy instead
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
  build: {
    sourcemap: true,
    minify: 'esbuild',
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/react') || id.includes('node_modules/react-dom')) {
            return 'vendor';
          }

          if (id.includes('@google/genai')) {
            return 'gemini';
          }

          if (id.includes('lucide-react')) {
            return 'ui';
          }

          if (id.includes('/data/commandTerms')) {
            return 'commandTerms';
          }

          if (id.includes('/components/admin/')) {
            return 'admin';
          }

          if (id.includes('/components/dataManager/')) {
            return 'dataManager';
          }

          if (id.includes('/components/Workspace') || id.includes('/components/Evaluation')) {
            return 'workspace';
          }

          if (
            id.includes('/components/Prompt') ||
            id.includes('/components/SampleAnswer') ||
            id.includes('/components/ReferenceMaterials')
          ) {
            return 'prompts';
          }

          if (
            id.includes('/components/AppModals') ||
            id.includes('/components/ManifestImportModal')
          ) {
            return 'modals';
          }
        },
      },
    },
  },
});

/// <reference types="vitest/config" />
import { fileURLToPath, URL } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  server: { port: 5173 },
  build: {
    sourcemap: true,
    rollupOptions: {
      output: {
        // Long-lived vendor chunks so app deploys don't invalidate cached vendor code.
        manualChunks(id) {
          // Keep Vite's preload helper out of lazy chunks so the entry never pulls them in.
          if (id.includes('vite/preload-helper')) return 'runtime';
          // E2EE stack: only downloaded when Messages opens.
          if (/[\\/]node_modules[\\/](?:.*[\\/])?(ts-mls|@hpke|@noble|@scure)[\\/]/.test(id))
            return 'e2ee';
          if (!id.includes('node_modules')) return undefined;
          if (/[\\/](react|react-dom|scheduler|react-router)[\\/]/.test(id)) return 'react';
          if (id.includes('@supabase')) return 'supabase';
          if (id.includes('@tanstack')) return 'query';
          if (/[\\/](framer-motion|motion|motion-dom|motion-utils)[\\/]/.test(id)) return 'motion';
          if (/[\\/](zod|react-hook-form|@hookform)[\\/]/.test(id)) return 'forms';
          return undefined;
        },
      },
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    css: false,
    // jsdom suites are CPU-heavy: one worker per core oversubscribes the machine (and
    // `pnpm check` runs other packages alongside), which turns waits into timeouts.
    maxWorkers: 4,
  },
});

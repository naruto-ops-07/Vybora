/// <reference types="vitest/config" />
import { fileURLToPath, URL } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';

const PUBLIC = ['/features', '/privacy-and-security', '/faq', '/download'];
/** The app's routes (vercel.json rewrites the same set to app.html; the rest is a 404). */
const APP =
  /^\/(messages|friends|settings|login|signup|forgot-password|reset-password|auth\/callback)(\/|$)/;

/**
 * `vite preview` serves the build the way vercel.json does: prerendered public pages from
 * their folders, the app shell (app.html) for every other route.
 */
function previewLikeVercel(): Plugin {
  return {
    name: 'vybora-preview-routes',
    configurePreviewServer(server) {
      server.middlewares.use((req, _res, next) => {
        const [path = '/', query] = (req.url ?? '/').split('?');
        const clean = path.length > 1 ? path.replace(/\/+$/, '') : path;
        const q = query ? `?${query}` : '';
        if (clean === '/' || clean.includes('.')) return next();
        req.url =
          (PUBLIC.includes(clean)
            ? `${clean}/index.html`
            : APP.test(clean)
              ? '/app.html'
              : '/404.html') + q;
        next();
      });
    },
  };
}

export default defineConfig(({ isSsrBuild }) => ({
  plugins: [react(), tailwindcss(), previewLikeVercel()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  // The footer's year, fixed at build time so prerendered and hydrated markup agree.
  define: { __BUILD_YEAR__: JSON.stringify(new Date().getFullYear()) },
  server: { port: 5173 },
  build: {
    sourcemap: true,
    // Read by scripts/prerender.mjs (module preloads per page), then removed from dist.
    manifest: !isSsrBuild,
    rollupOptions: {
      // The prerender's Node build is one bundle; chunking is for browsers.
      output: isSsrBuild
        ? {}
        : {
            // Long-lived vendor chunks so app deploys don't invalidate cached vendor code.
            manualChunks(id) {
              // Keep Vite's preload helper out of lazy chunks so the entry never pulls them in.
              if (id.includes('vite/preload-helper')) return 'runtime';
              // E2EE stack: only downloaded when Messages opens.
              if (/[\\/]node_modules[\\/](?:.*[\\/])?(ts-mls|@hpke|@noble|@scure)[\\/]/.test(id))
                return 'e2ee';
              if (!id.includes('node_modules')) return undefined;
              // node_modules/<name>/ only, so `@phosphor-icons/react/` stays out of it.
              if (/[\\/]node_modules[\\/](react|react-dom|scheduler|react-router)[\\/]/.test(id))
                return 'react';
              if (id.includes('@supabase')) return 'supabase';
              if (id.includes('@tanstack')) return 'query';
              if (/[\\/](framer-motion|motion|motion-dom|motion-utils)[\\/]/.test(id))
                return 'motion';
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
    // The sign-up code tests type a whole form key by key (2–3.5 s alone). Under
    // `pnpm check`, with mobile and the database suite running alongside, they
    // passed 5 s and timed out. 15 s matches the mobile Jest budget.
    testTimeout: 15_000,
  },
}));

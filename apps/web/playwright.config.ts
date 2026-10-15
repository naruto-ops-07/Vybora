import { defineConfig, devices } from '@playwright/test';

/**
 * E2E against a production build served by `vite preview`.
 * - `smoke.spec.ts` needs no backend.
 * - `social.spec.ts` runs only when E2E_SUPABASE_URL / E2E_SUPABASE_ANON_KEY
 *   point at a Supabase stack with email confirmation disabled
 *   (e.g. the local CLI stack from `supabase start`).
 */
const backend = process.env.E2E_SUPABASE_URL;
const anonKey = process.env.E2E_SUPABASE_ANON_KEY;

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: 'http://localhost:4173',
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { ...devices['Pixel 7'] }, testMatch: /smoke/ },
  ],
  webServer: {
    command: 'pnpm build && pnpm preview',
    url: 'http://localhost:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    env: {
      VITE_SUPABASE_URL: backend ?? 'http://127.0.0.1:54321',
      VITE_SUPABASE_ANON_KEY: anonKey ?? 'e2e-placeholder-anon-key-not-a-secret',
      VITE_SITE_URL: 'http://localhost:4173',
    },
  },
});

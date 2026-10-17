#!/usr/bin/env node
/**
 * Full-page screenshots of the dev-only design gallery (`/__gallery`) for visual
 * review. Not part of the test suite, and it starts nothing: run the dev server
 * yourself, then
 *
 *   node apps/web/scripts/gallery-shots.mjs [baseUrl]    # default http://localhost:5173
 *
 * Writes to apps/web/.impeccable/review/ (git-ignored):
 *   desktop.png        1440×900, dark
 *   mobile.png         390×844, dark
 *   desktop-light.png  1440×900, light
 *   desktop-hc.png     1440×900, dark + high contrast
 *   mobile-light.png   390×844, light
 *   mobile-hc.png      390×844, dark + high contrast
 *   landing.png        1440×900, the signed-out landing page (`/`)
 *
 * Requests to anything other than the dev server and Google Fonts are blocked, so a
 * stray call can never reach a hosted backend.
 */
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const base = new URL(process.argv[2] ?? 'http://localhost:5173');
const out = join(dirname(fileURLToPath(import.meta.url)), '..', '.impeccable', 'review');
mkdirSync(out, { recursive: true });

const ALLOWED_HOSTS = new Set([base.host, 'fonts.googleapis.com', 'fonts.gstatic.com']);

const SHOTS = [
  { file: 'desktop.png', viewport: { width: 1440, height: 900 }, query: 'theme=dark' },
  { file: 'mobile.png', viewport: { width: 390, height: 844 }, query: 'theme=dark', mobile: true },
  { file: 'desktop-light.png', viewport: { width: 1440, height: 900 }, query: 'theme=light' },
  {
    file: 'desktop-hc.png',
    viewport: { width: 1440, height: 900 },
    query: 'theme=dark&contrast=high',
  },
  {
    file: 'mobile-light.png',
    viewport: { width: 390, height: 844 },
    query: 'theme=light',
    mobile: true,
  },
  {
    file: 'mobile-hc.png',
    viewport: { width: 390, height: 844 },
    query: 'theme=dark&contrast=high',
    mobile: true,
  },
  // Signed out (a fresh context has no session), so `/` renders the landing page.
  { file: 'landing.png', viewport: { width: 1440, height: 900 }, path: '/' },
];

const browser = await chromium.launch();
let blocked = 0;
try {
  for (const shot of SHOTS) {
    const context = await browser.newContext({
      viewport: shot.viewport,
      deviceScaleFactor: shot.mobile ? 2 : 1,
      isMobile: !!shot.mobile,
      hasTouch: !!shot.mobile,
      reducedMotion: 'reduce',
    });
    await context.route('**/*', (route) => {
      const host = new URL(route.request().url()).host;
      if (ALLOWED_HOSTS.has(host)) return route.continue();
      blocked++;
      return route.abort();
    });
    const page = await context.newPage();
    const url = new URL(shot.path ?? `/__gallery?${shot.query}`, base);
    await page.goto(url.href, { waitUntil: 'networkidle' });
    if (shot.path) await page.locator('main h1').first().waitFor();
    else await page.getByRole('heading', { name: 'Design gallery' }).waitFor();
    await page.evaluate(() => document.fonts.ready);
    // Let late font swaps settle: shrink-wrapped bubbles re-measure a frame or two later.
    await page.waitForTimeout(500);
    const path = join(out, shot.file);
    await page.screenshot({ path, fullPage: true });
    console.log(`saved ${path}`);
    await context.close();
  }
} finally {
  await browser.close();
}
if (blocked) console.log(`blocked ${blocked} request(s) to other hosts`);

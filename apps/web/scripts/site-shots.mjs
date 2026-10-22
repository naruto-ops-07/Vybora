#!/usr/bin/env node
/**
 * Full-page screenshots of the public site for visual review. Starts nothing: build,
 * run `pnpm --filter @vybora/web preview --port 4179` (any port but 5173), then
 *
 *   node apps/web/scripts/site-shots.mjs [baseUrl]
 *
 * Writes apps/web/.impeccable/review/site/{page}-{look}-{mode}-{width}.png (git-ignored):
 * every public page in Velvet dark and light at 1440 and 390, and the homepage in Aurora
 * and Bloom (dark, 1440 and 390). The look is saved in localStorage before load, as a
 * returning visitor would have it. Every request to another host is blocked, so nothing
 * can reach a hosted backend.
 */
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const base = new URL(process.argv[2] ?? 'http://127.0.0.1:4179');
const out = join(dirname(fileURLToPath(import.meta.url)), '..', '.impeccable', 'review', 'site');
mkdirSync(out, { recursive: true });

const PAGES = [
  ['home', '/'],
  ['features', '/features'],
  ['privacy', '/privacy-and-security'],
  ['faq', '/faq'],
  ['download', '/download'],
];
const shots = [];
for (const [name, path] of PAGES)
  for (const mode of ['dark', 'light'])
    for (const width of [1440, 390]) shots.push({ name, path, look: 'velvet', mode, width });
for (const look of ['aurora', 'bloom'])
  for (const width of [1440, 390])
    shots.push({ name: 'home', path: '/', look, mode: 'dark', width });

const browser = await chromium.launch();
for (const s of shots) {
  const ctx = await browser.newContext({
    viewport: { width: s.width, height: s.width === 390 ? 844 : 900 },
    deviceScaleFactor: 1,
    colorScheme: s.mode,
  });
  await ctx.addInitScript(
    ([look, mode]) => localStorage.setItem('vybora.appearance', JSON.stringify({ look, mode })),
    [s.look, s.mode],
  );
  const page = await ctx.newPage();
  await page.route('**/*', (r) =>
    new URL(r.request().url()).host === base.host ? r.continue() : r.abort(),
  );
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(new URL(s.path, base).href, { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);
  const file = `${s.name}-${s.look}-${s.mode}-${s.width}.png`;
  await page.screenshot({ path: join(out, file), fullPage: true });
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  console.log(file, overflow > 0 ? `OVERFLOW ${overflow}px` : '', errors.join(' | '));
  await ctx.close();
}
await browser.close();

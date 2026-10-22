#!/usr/bin/env node
/**
 * Draws the social preview card (public/og.png, 1200×630) from code: an HTML card in
 * Velvet dark, set in the self-hosted Fraunces and DM Sans, screenshotted by Playwright
 * (already a dev dependency). Nothing is fetched; every request is blocked. Re-run after
 * changing the brand:
 *
 *   node apps/web/scripts/og-image.mjs
 */
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const web = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(join(web, 'package.json'));
const font = (pkg, file) =>
  readFileSync(join(dirname(require.resolve(`${pkg}/package.json`)), 'files', file)).toString(
    'base64',
  );
const fraunces = font('@fontsource-variable/fraunces', 'fraunces-latin-opsz-normal.woff2');
const dmSans = font('@fontsource-variable/dm-sans', 'dm-sans-latin-wght-normal.woff2');

// Velvet dark (packages/config/src/looks.ts → styles/looks.generated.css).
const html = `<!doctype html><html><head><style>
@font-face { font-family: Fraunces; src: url(data:font/woff2;base64,${fraunces}) format('woff2'); font-weight: 100 900; }
@font-face { font-family: 'DM Sans'; src: url(data:font/woff2;base64,${dmSans}) format('woff2'); font-weight: 100 1000; }
* { margin: 0; box-sizing: border-box; }
body { width: 1200px; height: 630px; overflow: hidden; background: #0f0d0b; color: #f3ede4;
  font-family: 'DM Sans', sans-serif; position: relative; }
.glow { position: absolute; inset: 0;
  background: radial-gradient(60% 70% at 78% 0%, rgba(212,180,131,0.22), transparent 70%); }
.wrap { position: absolute; inset: 72px 80px; display: flex; flex-direction: column; justify-content: space-between; }
.brand { display: flex; align-items: center; gap: 18px; font-weight: 700; font-size: 30px; letter-spacing: 0.14em; }
h1 { font-family: Fraunces; font-weight: 600; font-size: 112px; line-height: 0.95; letter-spacing: -0.01em; max-width: 9ch; }
.row { display: flex; align-items: flex-end; justify-content: space-between; }
p { font-size: 30px; color: #beb3a3; max-width: 15em; line-height: 1.3; }
.bubbles { position: absolute; right: 80px; top: 170px; width: 470px; display: flex; flex-direction: column; gap: 16px; }
.in, .out { font-size: 26px; padding: 18px 24px; border-radius: 26px; line-height: 1.25; }
.in { background: #221e1a; border-bottom-left-radius: 8px; align-self: flex-start; }
.in b { display: block; font-size: 19px; color: #d4b483; margin-bottom: 4px; }
.out { background: linear-gradient(135deg, #145244, #0d3b31); border-bottom-right-radius: 8px; align-self: flex-end; }
</style></head><body>
<div class="glow"></div>
<div class="bubbles">
  <div class="in"><b>Ines</b>Picnic at the lake, 3 pm?</div>
  <div class="out">Count me in. I’ll make the playlist</div>
</div>
<div class="wrap">
  <div class="brand">
    <svg width="56" height="56" viewBox="0 0 64 64"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#e5cb9c"/><stop offset="1" stop-color="#c4a16c"/></linearGradient></defs>
      <rect width="64" height="64" rx="14" fill="url(#g)"/><path d="M18 20 L32 45 L46 20" fill="none" stroke="#1a140c" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/><rect x="29" y="14" width="6" height="6" rx="1" fill="#1a140c"/></svg>
    VYBORA
  </div>
  <div class="row">
    <h1>Private and beautiful</h1>
    <p>Chats with your friends, <span style="white-space:nowrap">end-to-end</span> encrypted.</p>
  </div>
</div>
</body></html>`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
await page.route('**/*', (r) => (r.request().url().startsWith('data:') ? r.continue() : r.abort()));
await page.setContent(html, { waitUntil: 'load' });
await page.evaluate(() => document.fonts.ready);
await page.screenshot({ path: join(web, 'public', 'og.png') });
await browser.close();
console.log('wrote public/og.png');

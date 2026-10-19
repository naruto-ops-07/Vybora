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
 *   desktop-{aurora,bloom}[-light].png  1440×900, the other looks, dark and light
 *   landing.png        1440×900, the signed-out landing page (`/`)
 *   primitives-{look}-{mode}[-hc].png  the Primitives section alone, 1440 wide: Velvet
 *                      dark, light and high contrast, Aurora and Bloom in both modes. Each
 *                      also logs the primary button's and the dialog's computed depth, and
 *                      fails if high contrast leaves a gradient, shadow or blur.
 *
 * Without `?look=` the gallery shows Velvet, the default look.
 *
 * Requests to anything other than the dev server are blocked (fonts are self-hosted), so
 * a stray call can never reach a hosted backend.
 */
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const base = new URL(process.argv[2] ?? 'http://localhost:5173');
const out = join(dirname(fileURLToPath(import.meta.url)), '..', '.impeccable', 'review');
mkdirSync(out, { recursive: true });

const ALLOWED_HOSTS = new Set([base.host]);

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
  ...['aurora', 'bloom'].flatMap((look) =>
    ['dark', 'light'].map((theme) => ({
      file: `desktop-${look}${theme === 'light' ? '-light' : ''}.png`,
      viewport: { width: 1440, height: 900 },
      query: `look=${look}&theme=${theme}`,
    })),
  ),
  // Signed out (a fresh context has no session), so `/` renders the landing page.
  { file: 'landing.png', viewport: { width: 1440, height: 900 }, path: '/' },
  ...[
    ['velvet', 'dark'],
    ['velvet', 'light'],
    ['velvet', 'dark', true],
    ['velvet', 'light', true],
    ['aurora', 'dark'],
    ['aurora', 'light'],
    ['bloom', 'light'],
    ['bloom', 'dark'],
  ].map(([look, theme, hc]) => ({
    file: `primitives-${look}-${theme}${hc ? '-hc' : ''}.png`,
    viewport: { width: 1440, height: 900 },
    query: `look=${look}&theme=${theme}${hc ? '&contrast=high' : ''}`,
    section: 'primitives',
    hc: !!hc,
  })),
];

/** Computed depth of the Primitives section: what each look actually draws. */
async function primitiveDepth(page) {
  return page.evaluate(() => {
    const root = document.getElementById('primitives');
    const pick = (el, props) =>
      el && Object.fromEntries(props.map((p) => [p, getComputedStyle(el)[p]]));
    const flatProps = ['backgroundImage', 'boxShadow', 'backdropFilter'];
    const notFlat = [...root.querySelectorAll('.vy-btn, .vy-field, .vy-seg, .vy-popover, .vy-tile')]
      .map((el) => [el.className.split(' ').find((c) => c.startsWith('vy-')), pick(el, flatProps)])
      .filter(
        ([, s]) =>
          s.backgroundImage !== 'none' ||
          !/^(none|rgba\(0, 0, 0, 0\) 0px 0px 0px 0px)$/.test(s.boxShadow) ||
          !['none', ''].includes(s.backdropFilter),
      );
    return {
      primary: pick(root.querySelector('.vy-btn-primary'), [
        'backgroundImage',
        'boxShadow',
        'color',
        'borderRadius',
      ]),
      dialog: pick(root.querySelector('.vy-popover-3'), [
        'boxShadow',
        'backgroundColor',
        'backdropFilter',
        'borderTopColor',
      ]),
      notFlat,
    };
  });
}

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
    if (shot.path) {
      // Scroll once through the page so scroll-revealed sections are in the capture.
      await page.evaluate(async () => {
        for (let y = 0; y < document.documentElement.scrollHeight; y += 400) {
          window.scrollTo(0, y);
          await new Promise((r) => setTimeout(r, 80));
        }
        window.scrollTo(0, 0);
      });
      await page.waitForTimeout(1200);
    }
    // Let late font swaps settle: shrink-wrapped bubbles re-measure a frame or two later.
    await page.waitForTimeout(500);
    const path = join(out, shot.file);
    if (shot.section) {
      const depth = await primitiveDepth(page);
      console.log(shot.file, JSON.stringify({ primary: depth.primary, dialog: depth.dialog }));
      if (shot.hc && depth.notFlat.length) {
        console.error('not flat under high contrast:', JSON.stringify(depth.notFlat));
        process.exitCode = 1;
      }
      await page.locator(`#${shot.section}`).screenshot({ path });
    } else await page.screenshot({ path, fullPage: true });
    console.log(`saved ${path}`);
    await context.close();
  }
} finally {
  await browser.close();
}
if (blocked) console.log(`blocked ${blocked} request(s) to other hosts`);

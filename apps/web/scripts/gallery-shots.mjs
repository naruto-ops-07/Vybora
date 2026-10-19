#!/usr/bin/env node
/**
 * Full-page screenshots of the dev-only design gallery (`/__gallery`) for visual
 * review. Not part of the test suite, and it starts nothing: run the dev server
 * yourself, then
 *
 *   node apps/web/scripts/gallery-shots.mjs [baseUrl] [--only=prefix]
 *
 * (baseUrl defaults to http://localhost:5173; --only keeps the shots whose file name
 * starts with the prefix, e.g. --only=workspace.)
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
 *   workspace-{look}-{mode}-{1440,390}.png  the Workspace section (rail, list, chat), every
 *                      look × mode at both widths, plus workspace-hc-{mode}-1440.png. High
 *                      contrast fails if the canvas glow, a gradient bubble or a blur remains.
 *   empty-{look}-{mode}.png, friends-{look}-{mode}.png  the chat-list empty states and the
 *                      Friends section (Received / Sent tabs) per look × mode, 1440 wide.
 *   ambient.txt-style log lines: the canvas glow's animation per look with motion allowed.
 *   {look}-{dark,light,dark-hc}-{1440,390}.png  the whole gallery in every look × mode
 *                      (and dark + high contrast) at both widths.
 *   landing-{look}-{mode}-{1440,390}.png, landing-hc-dark-1440.png  the signed-out landing
 *                      page in the device's saved look (set in localStorage before load, as
 *                      a returning visitor would have it): every look in dark and light at
 *                      1440, dark at 390. High contrast fails if a glow, gradient or blur
 *                      remains anywhere on the page.
 *   {login,signup,forgot,email-code,404}-{look}-{mode}-{1440,390}.png  the auth pages and the 404 per
 *                      look, dark at 1440 and 390, light at 1440. Nothing is submitted.
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

const args = process.argv.slice(2);
const only = args.find((a) => a.startsWith('--only='))?.slice('--only='.length);
const base = new URL(args.find((a) => !a.startsWith('--')) ?? 'http://localhost:5173');
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
  // The whole gallery: every look × {dark, light, dark + high contrast} × {1440, 390}.
  ...['velvet', 'aurora', 'bloom'].flatMap((look) =>
    ['dark', 'light', 'dark-hc'].flatMap((mode) =>
      [1440, 390].map((width) => ({
        file: `${look}-${mode}-${width}.png`,
        viewport: { width, height: width === 390 ? 844 : 900 },
        mobile: width === 390,
        query: `look=${look}&theme=${mode.split('-')[0]}${mode.endsWith('hc') ? '&contrast=high' : ''}`,
      })),
    ),
  ),
  // Signed-out pages in the saved look: what a returning visitor's device shows.
  ...['velvet', 'aurora', 'bloom'].flatMap((look) =>
    [
      ['landing', '/'],
      ['login', '/login'],
      ['signup', '/signup'],
      ['forgot', '/forgot-password'],
      // The sign-up code step, drawn statically by a dev-only route (nothing is sent).
      ['email-code', '/__gallery/email-code'],
      ['404', '/no-such-page'],
    ].flatMap(([name, path]) =>
      [
        ['dark', 1440],
        ['light', 1440],
        ['dark', 390],
      ].map(([mode, width]) => ({
        file: `${name}-${look}-${mode}-${width}.png`,
        viewport: { width, height: width === 390 ? 844 : 900 },
        mobile: width === 390,
        path,
        storage: { 'vybora.appearance': JSON.stringify({ look, mode }) },
      })),
    ),
  ),
  ...[
    ['landing', '/'],
    ['login', '/login'],
  ].map(([name, path]) => ({
    file: `${name}-hc-dark-1440.png`,
    viewport: { width: 1440, height: 900 },
    path,
    hc: true,
    storage: {
      'vybora.appearance': JSON.stringify({ look: 'aurora', mode: 'dark' }),
      'vybora.a11y': JSON.stringify({ highContrast: true }),
    },
  })),
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
  ...['velvet', 'aurora', 'bloom'].flatMap((look) =>
    ['dark', 'light'].flatMap((theme) => [
      ...[1440, 390].map((width) => ({
        file: `workspace-${look}-${theme}-${width}.png`,
        viewport: { width, height: width === 390 ? 844 : 900 },
        mobile: width === 390,
        query: `look=${look}&theme=${theme}`,
        section: 'workspace',
      })),
      {
        file: `empty-${look}-${theme}.png`,
        viewport: { width: 1440, height: 900 },
        query: `look=${look}&theme=${theme}`,
        section: 'empty-states',
      },
      {
        file: `friends-${look}-${theme}.png`,
        viewport: { width: 1440, height: 900 },
        query: `look=${look}&theme=${theme}`,
        section: 'friends',
      },
    ]),
  ),
  ...['dark', 'light'].map((theme) => ({
    file: `workspace-hc-${theme}-1440.png`,
    viewport: { width: 1440, height: 900 },
    query: `look=aurora&theme=${theme}&contrast=high`,
    section: 'workspace',
    hc: true,
  })),
  // Motion allowed: the canvas glow's ambient animation per look (logged, no image).
  ...['velvet', 'aurora', 'bloom'].map((look) => ({
    file: `ambient-${look}`,
    viewport: { width: 1440, height: 900 },
    query: `look=${look}&theme=dark`,
    section: 'workspace',
    motion: true,
  })),
].filter((shot) => !only || shot.file.startsWith(only));

/** The Workspace section under high contrast: anything still lit, graded or frosted. */
async function workspaceLeftovers(page) {
  return page.evaluate(() => {
    const root = document.getElementById('workspace');
    const out = [];
    if (root.querySelector('[data-chat-glow]')) out.push('canvas glow is rendered');
    for (const el of root.querySelectorAll(
      '[data-bubble], .vy-panel, .vy-float, .vy-count, .vy-chip',
    )) {
      const s = getComputedStyle(el);
      if (s.backgroundImage !== 'none') out.push(`gradient on ${el.className.slice(0, 40)}`);
      if (!['none', ''].includes(s.backdropFilter))
        out.push(`blur on ${el.className.slice(0, 40)}`);
      if (!/^(none|rgba\(0, 0, 0, 0\) 0px 0px 0px 0px)$/.test(s.boxShadow))
        out.push(`shadow on ${el.className.slice(0, 40)}: ${s.boxShadow}`);
    }
    return out;
  });
}

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
      reducedMotion: shot.motion ? 'no-preference' : 'reduce',
    });
    await context.route('**/*', (route) => {
      const host = new URL(route.request().url()).host;
      if (ALLOWED_HOSTS.has(host)) return route.continue();
      blocked++;
      return route.abort();
    });
    if (shot.storage)
      await context.addInitScript((entries) => {
        for (const [k, v] of Object.entries(entries)) localStorage.setItem(k, v);
      }, shot.storage);
    const page = await context.newPage();
    const url = new URL(shot.path ?? `/__gallery?${shot.query}`, base);
    await page.goto(url.href, { waitUntil: 'networkidle' });
    if (shot.path) await page.locator('main h1').first().waitFor();
    else await page.getByRole('heading', { name: 'Design gallery' }).waitFor();
    await page.evaluate(() => document.fonts.ready);
    if (shot.storage) {
      // The saved look must be on <html> (from the pre-paint script), not the default.
      const want = JSON.parse(shot.storage['vybora.appearance']);
      const got = await page.evaluate(() => ({
        look: document.documentElement.dataset.look,
        theme: document.documentElement.dataset.theme,
        contrast: document.documentElement.dataset.contrast,
      }));
      if (got.look !== want.look || got.theme !== want.mode) {
        console.error(`${shot.file}: expected ${JSON.stringify(want)}, got ${JSON.stringify(got)}`);
        process.exitCode = 1;
      }
      if (shot.hc) {
        const left = await page.evaluate(() =>
          [...document.querySelectorAll('body *')]
            .filter((el) => {
              const st = getComputedStyle(el);
              return (
                el.classList.contains('vy-glow') ||
                st.backgroundImage.includes('gradient') ||
                !['none', ''].includes(st.backdropFilter) ||
                !/^(none|rgba\(0, 0, 0, 0\) 0px 0px 0px 0px)$/.test(st.boxShadow)
              );
            })
            .map((el) => `${el.tagName} ${String(el.className).slice(0, 50)}`),
        );
        if (left.length) {
          console.error(`${shot.file}: not flat under high contrast:`, JSON.stringify(left));
          process.exitCode = 1;
        }
      }
    }
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
    // Section shots: the gallery's sticky header would sit over the element.
    if (shot.section)
      await page.addStyleTag({ content: 'header.sticky { position: static !important; }' });
    // Let late font swaps settle: shrink-wrapped bubbles re-measure a frame or two later.
    await page.waitForTimeout(500);
    const path = join(out, shot.file);
    if (shot.motion) {
      const glow = await page.evaluate(() => {
        const el = document.querySelector('#workspace [data-chat-glow]');
        if (!el) return null;
        const s = getComputedStyle(el);
        return {
          ambient: el.dataset.ambient,
          animation: s.animationName,
          duration: s.animationDuration,
        };
      });
      console.log(shot.file, JSON.stringify(glow));
      await context.close();
      continue;
    }
    if (shot.section === 'workspace') {
      if (shot.hc) {
        const left = await workspaceLeftovers(page);
        if (left.length) {
          console.error('workspace not flat under high contrast:', JSON.stringify(left));
          process.exitCode = 1;
        }
      }
      await page.locator('#workspace').screenshot({ path });
    } else if (shot.section && shot.section !== 'primitives') {
      await page.locator(`#${shot.section}`).screenshot({ path });
    } else if (shot.section) {
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

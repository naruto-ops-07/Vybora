#!/usr/bin/env node
/**
 * Prerenders the public pages to static HTML after `vite build` (part of `pnpm build`).
 *
 * No new dependency: Vite builds src/site/entry-server.tsx for Node, React renders each
 * page to a string, and this script writes it into the built index.html with that page's
 * head tags. The browser then hydrates it (src/site/client.tsx), so crawlers and link
 * previews get real content and visitors see the page before any script runs.
 *
 * Writes to dist/:
 *   index.html, features/index.html, privacy-and-security/index.html, faq/index.html,
 *   download/index.html   the public pages, indexable, with canonical, OG, Twitter, JSON-LD
 *   app.html              the app shell for every other route: noindex, the generic card
 *   sitemap.xml, robots.txt
 *
 * The site origin comes from VITE_SITE_URL (localhost values fall back to
 * https://vybora.app, see src/site/meta.ts).
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build, loadEnv } from 'vite';

const web = join(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(web, 'dist');
const tmp = join(web, '.prerender');

await build({
  root: web,
  configFile: join(web, 'vite.config.ts'),
  mode: 'production',
  logLevel: 'warn',
  build: {
    ssr: 'src/site/entry-server.tsx',
    outDir: tmp,
    emptyOutDir: true,
    sourcemap: false,
    copyPublicDir: false,
  },
  ssr: { noExternal: true },
});

const entry = readdirSync(tmp).find((f) => /^entry-server\.m?js$/.test(f));
if (!entry) throw new Error('prerender: the server entry was not built');
const server = await import(pathToFileURL(join(tmp, entry)).href);

const env = { ...loadEnv('production', web, 'VITE_'), ...process.env };
const origin = server.siteOrigin(env.VITE_SITE_URL);

const template = readFileSync(join(dist, 'index.html'), 'utf8');
const HEAD = /<!-- head:start[\s\S]*?<!-- head:end -->/;
const ROOT = '<div id="root"></div>';
if (!HEAD.test(template) || !template.includes(ROOT))
  throw new Error('prerender: index.html is missing the head markers or the empty root');

// Preload the hydration path for each page: the site client, the page chunk and their
// static imports, so the browser fetches them in parallel instead of one after another.
const manifestPath = join(dist, '.vite', 'manifest.json');
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
function chunkFiles(key, seen = new Set()) {
  const c = manifest[key];
  if (!c || seen.has(key)) return seen;
  seen.add(key);
  for (const i of c.imports ?? []) chunkFiles(i, seen);
  return seen;
}
const files = (keys) => {
  const seen = new Set();
  for (const k of keys) chunkFiles(k, seen);
  return [...seen].filter((k) => !manifest[k].isEntry).map((k) => manifest[k].file);
};
const PAGE_SOURCES = {
  '/': 'src/site/pages/Home.tsx',
  '/features': 'src/site/pages/Features.tsx',
  '/privacy-and-security': 'src/site/pages/PrivacySecurity.tsx',
  '/faq': 'src/site/pages/FaqPage.tsx',
  '/download': 'src/site/pages/Download.tsx',
};

// The default look's text faces (latin subsets), so the first paint is in Velvet's type.
const assets = readdirSync(join(dist, 'assets'));
const fonts = [/^fraunces-latin-opsz-normal-.*\.woff2$/, /^dm-sans-latin-wght-normal-.*\.woff2$/]
  .map((re) => assets.find((f) => re.test(f)))
  .filter(Boolean);
if (fonts.length !== 2) console.warn('prerender: Velvet font files not found; no font preload');
const fontLinks = fonts.map(
  (f) => `<link rel="preload" href="/assets/${f}" as="font" type="font/woff2" crossorigin />`,
);

const withHead = (tags) => template.replace(HEAD, tags);

// The app shell first, from the untouched template.
writeFileSync(join(dist, 'app.html'), withHead(server.headTags(origin)));

for (const page of server.PUBLIC_PAGES) {
  const body = server.render(page.path);
  const h1 = body.match(/<h1[^>]*>([\s\S]*?)<\/h1>/);
  if (!h1) throw new Error(`prerender: ${page.path} rendered without an <h1>`);
  const preloads = files(['src/site/client.tsx', PAGE_SOURCES[page.path]]).map(
    (f) => `<link rel="modulepreload" crossorigin href="/${f}" />`,
  );
  const tags = [
    server.headTags(origin, page, page.path === '/faq' ? server.ALL_FAQ : undefined),
    ...fontLinks,
    ...preloads,
  ].join('\n    ');
  const html = withHead(tags).replace(ROOT, `<div id="root">${body}</div>`);
  const dir = page.path === '/' ? dist : join(dist, page.path.slice(1));
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'index.html'), html);
  console.log(`prerendered ${page.path.padEnd(22)} ${(html.length / 1024).toFixed(1)} kB`);
}

writeFileSync(join(dist, 'sitemap.xml'), server.sitemapXml(origin));
writeFileSync(join(dist, 'robots.txt'), server.robotsTxt(origin));
console.log(`sitemap.xml and robots.txt for ${origin}`);

rmSync(tmp, { recursive: true, force: true });
// The manifest only served this script; it isn't deployed.
if (existsSync(manifestPath)) rmSync(join(dist, '.vite'), { recursive: true, force: true });

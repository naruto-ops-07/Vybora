import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { renderToString } from 'react-dom/server';
import type { ComponentType } from 'react';
import { MemoryRouter, StaticRouter } from 'react-router';
import { describe, expect, it } from 'vitest';
import { A11yProvider } from '@/features/a11y/A11yProvider';
import { ALL_FAQ, HOME_FAQ, SERVER } from './content';
import {
  headTags,
  isPublicPath,
  PUBLIC_PAGES,
  robotsTxt,
  siteOrigin,
  sitemapXml,
  structuredData,
} from './meta';
import Download from './pages/Download';
import FaqPage from './pages/FaqPage';
import Features from './pages/Features';
import Home from './pages/Home';
import PrivacySecurity from './pages/PrivacySecurity';
import { SiteRoutes } from './routes';

const PAGES: Record<string, ComponentType> = {
  '/': Home,
  '/features': Features,
  '/privacy-and-security': PrivacySecurity,
  '/faq': FaqPage,
  '/download': Download,
};
const ORIGIN = 'https://example.test';

const renderAt = (path: string) =>
  render(
    <A11yProvider>
      <MemoryRouter initialEntries={[path]}>
        <SiteRoutes pages={PAGES} />
      </MemoryRouter>
    </A11yProvider>,
  );

const ssr = (path: string) =>
  renderToString(
    <A11yProvider>
      <StaticRouter location={path}>
        <SiteRoutes pages={PAGES} />
      </StaticRouter>
    </A11yProvider>,
  );

describe('public routes', () => {
  it.each(PUBLIC_PAGES.map((p) => p.path))('%s renders one h1 inside the shared frame', (path) => {
    renderAt(path);
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(screen.getByRole('navigation', { name: 'Site' })).toBeInTheDocument();
    const site = within(screen.getByRole('navigation', { name: 'Site' }));
    for (const p of PUBLIC_PAGES)
      expect(site.getAllByRole('link').some((a) => a.getAttribute('href') === p.path)).toBe(true);
    expect(screen.getAllByText('Encryption not yet independently audited.').length).toBe(1);
  });

  it('knows which paths are public; app routes and add links are not', () => {
    for (const p of ['/', '/features', '/faq/', '/download', '/privacy-and-security'])
      expect(isPublicPath(p)).toBe(true);
    for (const p of ['/friends', '/messages', '/login', '/signup', '/settings/privacy'])
      expect(isPublicPath(p)).toBe(false);
  });

  it('homepage leads with one clear path to sign up, plus the web app', () => {
    renderAt('/');
    const hero = screen.getByRole('region', { name: 'Your people, in colour.' });
    const links = within(hero).getAllByRole('link');
    expect(links.map((a) => a.textContent)).toEqual(['Create your account', 'Open web app']);
    expect(links[0]).toHaveAttribute('href', '/signup');
    expect(links[1]).toHaveAttribute('href', '/messages');
    expect(screen.getAllByRole('link', { name: 'Sign in' })[0]).toHaveAttribute('href', '/login');
  });

  it('the hero phone switches looks on its own, as a radio group', () => {
    renderAt('/');
    const group = screen.getByRole('radiogroup', { name: 'Try a look' });
    const radios = within(group).getAllByRole('radio');
    expect(radios.map((r) => r.textContent)).toEqual(['Velvet', 'Aurora', 'Bloom']);
    fireEvent.click(radios[2]!);
    expect(radios[2]).toHaveAttribute('aria-checked', 'true');
    expect(document.querySelector('[data-look="bloom"]')).not.toBeNull();
  });
});

describe('claims', () => {
  it('keeps the earlier landing page’s facts', () => {
    renderAt('/');
    for (const s of [...SERVER.cannot, ...SERVER.can]) expect(screen.getByText(s)).toBeVisible();
    for (const { q } of HOME_FAQ) expect(screen.getByText(q)).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'Bring your circle. Keep it between you.' }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Add people by their exact username, no phone number needed/),
    ).toBeInTheDocument();
  });

  it('is honest about audits, store apps and limits, and never overclaims', () => {
    const text = PUBLIC_PAGES.map((p) => ssr(p.path)).join(' ');
    expect(text).toMatch(/not yet independently audited/i);
    expect(text).toMatch(/hasn’t been independently audited|has not been independently audited/);
    expect(text).toMatch(/Not in the App Store or Google Play yet/);
    for (const banned of [
      /signal[- ]equivalent/i,
      /\baudited by\b/i,
      /\d[\d,.]*\+?\s*(users|downloads|people use)/i,
      /testimonial|\breviews\b|customer review|rated \d|★/i,
      /apps\.apple\.com|play\.google\.com/i,
      /coming soon/i,
    ])
      expect(text).not.toMatch(banned);
  });

  it('has no eyebrow or kicker labels above headings', () => {
    const html = PUBLIC_PAGES.map((p) => ssr(p.path)).join(' ');
    expect(html).not.toMatch(/uppercase[^"]*tracking-\[?0?\.\d|tracking-widest|eyebrow|kicker/);
  });
});

describe('head tags', () => {
  it.each(PUBLIC_PAGES.map((p) => [p.path, p] as const))(
    '%s has its own title, canonical and cards',
    (path, page) => {
      const tags = headTags(ORIGIN, page);
      expect(tags).toContain(`<title>${page.title}</title>`);
      expect(tags).toContain(
        `<link rel="canonical" href="${ORIGIN}${path === '/' ? '/' : path}" />`,
      );
      expect(tags).toContain('content="index, follow"');
      expect(tags).toContain(`<meta property="og:image" content="${ORIGIN}/og.png" />`);
      expect(tags).toContain('<meta name="twitter:card" content="summary_large_image" />');
      expect(page.description.length).toBeLessThanOrEqual(170);
    },
  );

  it('titles and descriptions are unique per page', () => {
    expect(new Set(PUBLIC_PAGES.map((p) => p.title)).size).toBe(PUBLIC_PAGES.length);
    expect(new Set(PUBLIC_PAGES.map((p) => p.description)).size).toBe(PUBLIC_PAGES.length);
  });

  it('the app shell is noindex with the generic card and no canonical', () => {
    const tags = headTags(ORIGIN);
    expect(tags).toContain('content="noindex, nofollow"');
    expect(tags).toContain(`${ORIGIN}/og.png`);
    expect(tags).not.toContain('canonical');
    expect(tags).not.toContain('ld+json');
  });

  it('index.html ships noindex defaults (so /friends?add=… previews stay generic)', () => {
    const html = readFileSync(join(__dirname, '..', '..', 'index.html'), 'utf8');
    expect(html).toContain('<meta name="robots" content="noindex, nofollow" />');
    expect(html).toContain('<!-- head:start');
    expect(html).toContain('<div id="root"></div>');
  });

  it('JSON-LD carries only true fields', () => {
    const ld = JSON.parse(structuredData(ORIGIN, PUBLIC_PAGES[0]));
    const types = ld['@graph'].map((n: { '@type': string }) => n['@type']);
    expect(types).toEqual(['Organization', 'SoftwareApplication']);
    const json = JSON.stringify(ld);
    expect(json).not.toMatch(/aggregateRating|review|offers|price|ratingValue/);
    const faq = JSON.parse(structuredData(ORIGIN, PUBLIC_PAGES[3], ALL_FAQ));
    expect(faq['@graph'][0].mainEntity).toHaveLength(ALL_FAQ.length);
  });

  it('falls back to the real domain for localhost origins', () => {
    expect(siteOrigin('http://localhost:5173')).toBe('https://vybora.app');
    expect(siteOrigin(undefined)).toBe('https://vybora.app');
    expect(siteOrigin('https://chat.example.com/')).toBe('https://chat.example.com');
  });
});

describe('sitemap and robots', () => {
  it('the sitemap lists exactly the public pages', () => {
    const xml = sitemapXml(ORIGIN);
    const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
    expect(locs).toEqual(
      PUBLIC_PAGES.map((p) => (p.path === '/' ? `${ORIGIN}/` : ORIGIN + p.path)),
    );
    expect(xml).not.toMatch(/messages|settings|friends|login/);
  });

  it('robots points at the sitemap, keeps crawlers out of the app, lets previews read add links', () => {
    const txt = robotsTxt(ORIGIN);
    expect(txt).toContain(`Sitemap: ${ORIGIN}/sitemap.xml`);
    expect(txt).toContain('Disallow: /messages');
    expect(txt).toContain('Disallow: /settings');
    expect(txt).not.toContain('Disallow: /friends');
  });
});

describe('prerender', () => {
  it.each(PUBLIC_PAGES.map((p) => p.path))('%s renders real content to static HTML', (path) => {
    const html = ssr(path);
    expect(html).toMatch(/<h1[^>]*>/);
    expect(html).toContain('<header');
    expect(html).toContain('<footer');
    expect(html.replace(/<[^>]+>/g, ' ').trim().length).toBeGreaterThan(800);
  });

  it('the FAQ answers are in the HTML, not behind script', () => {
    const html = ssr('/faq');
    for (const { a } of ALL_FAQ.slice(0, 3))
      expect(html).toContain(a.replace(/&/g, '&amp;').replace(/’/g, '’'));
  });
});

describe('reduced motion', () => {
  const css = readFileSync(join(__dirname, '..', 'styles', 'index.css'), 'utf8');
  const site = readFileSync(join(__dirname, '..', 'styles', 'site.css'), 'utf8');

  it('the site’s moves only use what the global reduced-motion rule stops', () => {
    expect(css).toMatch(/prefers-reduced-motion: reduce/);
    expect(css).toMatch(/\[data-reduce-motion='true'\] \*/);
    expect(site).toMatch(/animation|transition/);
    // The arrival only replays after a look switch, never on load.
    expect(site).toMatch(/\.site-replay \.site-arrive/);
  });

  it('the public pages load neither the motion library nor smooth scrolling', () => {
    const src = ['pages/Home.tsx', 'parts/PhonePreview.tsx', 'parts/Journey.tsx', 'SiteLayout.tsx']
      .map((f) => readFileSync(join(__dirname, f), 'utf8'))
      .join('\n');
    expect(src).not.toMatch(/from 'motion|lenis/);
  });
});

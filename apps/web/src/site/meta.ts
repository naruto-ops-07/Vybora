/**
 * The public site's pages and what search engines and link previews see for each.
 * One source for the client head (useSiteHead), the prerender script, the sitemap
 * and the tests. Pure: no DOM, so it runs in Node at build time.
 */

export const SITE_NAME = 'VYBORA';

/**
 * Where the site lives, for canonical links, the sitemap and social cards. The build
 * reads VITE_SITE_URL; a localhost value (the dev default) falls back to the domain the
 * mobile app already links to. The owner should set VITE_SITE_URL for production.
 */
export const FALLBACK_ORIGIN = 'https://vybora.app';

export function siteOrigin(configured?: string | null): string {
  const raw = (configured ?? '').trim().replace(/\/+$/, '');
  if (!/^https?:\/\//.test(raw)) return FALLBACK_ORIGIN;
  try {
    const host = new URL(raw).hostname;
    if (host === 'localhost' || host === '127.0.0.1' || host.endsWith('.localhost'))
      return FALLBACK_ORIGIN;
  } catch {
    return FALLBACK_ORIGIN;
  }
  return raw;
}

export interface PageMeta {
  path: string;
  /** The <title>; also the social card title. */
  title: string;
  description: string;
  /** Short label in the header and footer. */
  nav: string;
}

export const PUBLIC_PAGES: readonly PageMeta[] = [
  {
    path: '/',
    nav: 'Home',
    title: 'VYBORA: private messaging for you and your friends',
    description:
      'Chat with friends and groups, share photos, video and voice notes, and pick a look you love. End-to-end encrypted, so only the people in the chat can read it.',
  },
  {
    path: '/features',
    nav: 'Features',
    title: 'Features: friends, groups, colour and more | VYBORA',
    description:
      'Add friends by username, run groups with roles, send photos, video and voice notes, set disappearing messages and choose Velvet, Aurora or Bloom.',
  },
  {
    path: '/privacy-and-security',
    nav: 'Privacy',
    title: 'Privacy and security: how VYBORA encryption works | VYBORA',
    description:
      'How MLS end-to-end encryption protects your chats, exactly what our servers can and can’t see, and what has not been independently audited yet.',
  },
  {
    path: '/faq',
    nav: 'FAQ',
    title: 'Questions about VYBORA, answered plainly | VYBORA',
    description:
      'Phone numbers, lost devices, audits, disappearing messages, who can message you and more: straight answers about VYBORA.',
  },
  {
    path: '/download',
    nav: 'Download',
    title: 'Get VYBORA on the web, iPhone and Android | VYBORA',
    description:
      'Use VYBORA in your browser today. The iPhone and Android app isn’t in the App Store or Google Play yet.',
  },
];

export const PUBLIC_PATHS = PUBLIC_PAGES.map((p) => p.path);

export const isPublicPath = (pathname: string) =>
  PUBLIC_PATHS.includes(pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname);

export const pageFor = (pathname: string): PageMeta | undefined =>
  PUBLIC_PAGES.find(
    (p) => p.path === (pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname),
  );

/** The signed-in app and every other route: one generic card, never indexed. */
export const APP_META = {
  title: 'VYBORA',
  description: 'Private messaging with end-to-end encryption, on the web and on your phone.',
};

export const SOCIAL_IMAGE = { path: '/og.png', width: 1200, height: 630 };
export const SOCIAL_IMAGE_ALT =
  'VYBORA: private and beautiful messaging. A chat bubble on warm black.';

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export function canonicalUrl(origin: string, path: string) {
  return path === '/' ? `${origin}/` : `${origin}${path}`;
}

/** Only true fields: no ratings, prices, counts or reviews. */
export function structuredData(origin: string, page?: PageMeta, faq?: { q: string; a: string }[]) {
  const graph: Record<string, unknown>[] = [];
  if (!page || page.path === '/') {
    graph.push(
      {
        '@type': 'Organization',
        '@id': `${origin}/#organization`,
        name: SITE_NAME,
        url: `${origin}/`,
        logo: `${origin}/icon-512.png`,
      },
      {
        '@type': 'SoftwareApplication',
        name: SITE_NAME,
        url: `${origin}/`,
        applicationCategory: 'CommunicationApplication',
        operatingSystem: 'Web browser',
        description: PUBLIC_PAGES[0]!.description,
        publisher: { '@id': `${origin}/#organization` },
      },
    );
  }
  if (faq?.length) {
    graph.push({
      '@type': 'FAQPage',
      mainEntity: faq.map(({ q, a }) => ({
        '@type': 'Question',
        name: q,
        acceptedAnswer: { '@type': 'Answer', text: a },
      })),
    });
  }
  if (!graph.length) return '';
  // `<` is escaped so no answer text can ever close the script element.
  return JSON.stringify({ '@context': 'https://schema.org', '@graph': graph }).replace(
    /</g,
    '\\u003c',
  );
}

/** Every head tag for a page (or, without one, the app shell's noindex defaults). */
export function headTags(
  origin: string,
  page?: PageMeta,
  faq?: { q: string; a: string }[],
): string {
  const title = page?.title ?? APP_META.title;
  const description = page?.description ?? APP_META.description;
  const image = `${origin}${SOCIAL_IMAGE.path}`;
  const tags = [
    `<title>${esc(title)}</title>`,
    `<meta name="description" content="${esc(description)}" />`,
    `<meta name="robots" content="${page ? 'index, follow' : 'noindex, nofollow'}" />`,
    page ? `<link rel="canonical" href="${esc(canonicalUrl(origin, page.path))}" />` : '',
    `<meta property="og:site_name" content="${SITE_NAME}" />`,
    `<meta property="og:type" content="website" />`,
    `<meta property="og:title" content="${esc(title)}" />`,
    `<meta property="og:description" content="${esc(description)}" />`,
    page ? `<meta property="og:url" content="${esc(canonicalUrl(origin, page.path))}" />` : '',
    `<meta property="og:image" content="${esc(image)}" />`,
    `<meta property="og:image:width" content="${SOCIAL_IMAGE.width}" />`,
    `<meta property="og:image:height" content="${SOCIAL_IMAGE.height}" />`,
    `<meta property="og:image:alt" content="${esc(SOCIAL_IMAGE_ALT)}" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:title" content="${esc(title)}" />`,
    `<meta name="twitter:description" content="${esc(description)}" />`,
    `<meta name="twitter:image" content="${esc(image)}" />`,
  ];
  const ld = page ? structuredData(origin, page, faq) : '';
  if (ld) tags.push(`<script type="application/ld+json">${ld}</script>`);
  return tags.filter(Boolean).join('\n    ');
}

export function sitemapXml(origin: string): string {
  const urls = PUBLIC_PAGES.map(
    (p) => `  <url>\n    <loc>${esc(canonicalUrl(origin, p.path))}</loc>\n  </url>`,
  ).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
}

/**
 * Signed-in areas crawlers have no reason to fetch. Every app route is also noindex.
 * /friends, /login and /signup stay fetchable on purpose: link-preview bots honour
 * robots.txt, and a shared add-friend link (/friends?add=…) should still show the
 * generic social card.
 */
export const APP_DISALLOW = ['/messages', '/settings', '/auth/', '/reset-password'];

export function robotsTxt(origin: string): string {
  return [
    'User-agent: *',
    'Allow: /',
    ...APP_DISALLOW.map((p) => `Disallow: ${p}`),
    '',
    `Sitemap: ${origin}/sitemap.xml`,
    '',
  ].join('\n');
}

import { useEffect } from 'react';
import { APP_META, canonicalUrl, pageFor, siteOrigin, SOCIAL_IMAGE, type PageMeta } from './meta';

export const ORIGIN = siteOrigin(import.meta.env.VITE_SITE_URL);

function setMeta(attr: 'name' | 'property', key: string, content: string) {
  let el = document.head.querySelector<HTMLMetaElement>(`meta[${attr}="${key}"]`);
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.setAttribute('content', content);
}

function setCanonical(href: string | null) {
  let el = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
  if (!href) {
    el?.remove();
    return;
  }
  if (!el) {
    el = document.createElement('link');
    el.rel = 'canonical';
    document.head.appendChild(el);
  }
  el.href = href;
}

/** Writes a page's title, description, canonical, robots and social tags into <head>. */
export function applyHead(page: PageMeta | undefined) {
  const title = page?.title ?? APP_META.title;
  const description = page?.description ?? APP_META.description;
  const url = page ? canonicalUrl(ORIGIN, page.path) : null;
  document.title = title;
  setMeta('name', 'description', description);
  setMeta('name', 'robots', page ? 'index, follow' : 'noindex, nofollow');
  setMeta('property', 'og:title', title);
  setMeta('property', 'og:description', description);
  setMeta('property', 'og:image', `${ORIGIN}${SOCIAL_IMAGE.path}`);
  setMeta('name', 'twitter:title', title);
  setMeta('name', 'twitter:description', description);
  setCanonical(url);
  if (url) setMeta('property', 'og:url', url);
  else document.head.querySelector('meta[property="og:url"]')?.remove();
}

/**
 * Keeps <head> in step with client-side navigation between public pages, and puts the
 * app's noindex defaults back when the visitor leaves the public site.
 */
export function useSiteHead(pathname: string) {
  useEffect(() => {
    applyHead(pageFor(pathname));
  }, [pathname]);
  useEffect(() => () => applyHead(undefined), []);
}

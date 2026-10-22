import { lazy, Suspense, type ComponentType } from 'react';
import { Route, Routes } from 'react-router';
import { PUBLIC_PAGES } from './meta';
import { SiteLayout } from './SiteLayout';

type PageModule = { default: ComponentType };

/** Each public page is its own chunk. */
export const PAGE_LOADERS: Record<string, () => Promise<PageModule>> = {
  '/': () => import('./pages/Home'),
  '/features': () => import('./pages/Features'),
  '/privacy-and-security': () => import('./pages/PrivacySecurity'),
  '/faq': () => import('./pages/FaqPage'),
  '/download': () => import('./pages/Download'),
};

export const LAZY_PAGES: Record<string, ComponentType> = Object.fromEntries(
  Object.entries(PAGE_LOADERS).map(([path, load]) => [path, lazy(load)]),
);

/**
 * The public site's routes. The client passes lazy pages and the prerender passes the
 * same pages eagerly; both render inside the same Suspense boundary so the markup the
 * browser hydrates matches what was prerendered.
 */
export function SiteRoutes({ pages = LAZY_PAGES }: { pages?: Record<string, ComponentType> }) {
  return (
    <Routes>
      <Route element={<SiteLayout />}>
        {PUBLIC_PAGES.map(({ path }) => {
          const Page = pages[path]!;
          const element = (
            <Suspense fallback={null}>
              <Page />
            </Suspense>
          );
          return path === '/' ? (
            <Route key={path} index element={element} />
          ) : (
            <Route key={path} path={path.slice(1)} element={element} />
          );
        })}
      </Route>
    </Routes>
  );
}

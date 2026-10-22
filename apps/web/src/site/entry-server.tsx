/**
 * Build-time render of the public pages (scripts/prerender.mjs). Pages are imported
 * eagerly; everything else matches the client tree in site/client.tsx.
 */
import { StrictMode, type ComponentType } from 'react';
import { renderToString } from 'react-dom/server';
import { StaticRouter } from 'react-router';
import { A11yProvider } from '@/features/a11y/A11yProvider';
import Download from './pages/Download';
import FaqPage from './pages/FaqPage';
import Features from './pages/Features';
import Home from './pages/Home';
import PrivacySecurity from './pages/PrivacySecurity';
import { SiteRoutes } from './routes';

const EAGER: Record<string, ComponentType> = {
  '/': Home,
  '/features': Features,
  '/privacy-and-security': PrivacySecurity,
  '/faq': FaqPage,
  '/download': Download,
};

export function render(path: string): string {
  return renderToString(
    <StrictMode>
      <A11yProvider>
        <StaticRouter location={path}>
          <SiteRoutes pages={EAGER} />
        </StaticRouter>
      </A11yProvider>
    </StrictMode>,
  );
}

export { ALL_FAQ } from './content';
export { headTags, PUBLIC_PAGES, robotsTxt, siteOrigin, sitemapXml } from './meta';

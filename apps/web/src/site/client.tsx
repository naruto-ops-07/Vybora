import { StrictMode } from 'react';
import { createRoot, hydrateRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router';
import { A11yProvider } from '@/features/a11y/A11yProvider';
import { pageFor } from './meta';
import { PAGE_LOADERS, SiteRoutes } from './routes';

/**
 * Starts a public page without the signed-in app (no auth, storage or query code). A
 * prerendered page is hydrated once its chunk has loaded, so nothing on screen changes.
 */
export async function startSite(root: HTMLElement) {
  const page = pageFor(location.pathname);
  if (page) await PAGE_LOADERS[page.path]!();
  const tree = (
    <StrictMode>
      <A11yProvider>
        <BrowserRouter>
          <SiteRoutes />
        </BrowserRouter>
      </A11yProvider>
    </StrictMode>
  );
  if (root.firstElementChild) hydrateRoot(root, tree);
  else createRoot(root).render(tree);
}

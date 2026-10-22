import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { applyHead } from '@/site/head';
import { App } from './App';

/** The signed-in app (and every non-public route), rendered fresh on the client. */
export function startApp(root: HTMLElement) {
  // A prerendered public page may be in the root (a signed-in visitor on "/"); the app
  // replaces it.
  root.replaceChildren();
  // …and its indexable head: app routes are noindex with the generic card.
  applyHead(undefined);
  createRoot(root).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from '@/app/App';
import { startAppearance } from '@/lib/theme';
import { initMonitoring } from '@/lib/monitoring';
// Self-hosted faces. Velvet (the default look) and Plex Mono load up front; Aurora's
// and Bloom's load when shown (lib/theme.ts). Fraunces carries its optical-size axis.
import '@fontsource-variable/fraunces/opsz.css';
import '@fontsource-variable/dm-sans/index.css';
import '@fontsource/ibm-plex-mono/400.css';
import '@fontsource/ibm-plex-mono/500.css';
import '@/styles/index.css';

initMonitoring();
// index.html already painted the saved look; this migrates the old key, loads the
// look's fonts and follows the system mode from here on.
startAppearance();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

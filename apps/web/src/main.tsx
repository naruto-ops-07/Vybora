import { startAppearance } from '@/lib/theme';
import { initMonitoring } from '@/lib/monitoring';
import { isPublicPath } from '@/site/meta';
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

/** A stored Supabase session (`sb-<project>-auth-token`); read without loading Supabase. */
function hasStoredSession() {
  try {
    for (let i = 0; i < localStorage.length; i++)
      if (/^sb-.+-auth-token$/.test(localStorage.key(i) ?? '')) return true;
  } catch {
    /* storage unavailable: treat as signed out */
  }
  return false;
}

const root = document.getElementById('root')!;
const { pathname } = location;

// Public pages start without the app's auth, storage and query code. A signed-in visitor
// on "/" gets the app, which sends them to their chats.
if (isPublicPath(pathname) && !(pathname === '/' && hasStoredSession())) {
  void import('@/site/client').then((m) => m.startSite(root));
} else {
  void import('@/app/start').then((m) => m.startApp(root));
}

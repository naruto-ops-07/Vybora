/**
 * Where to go after signing in or up (`?next=`), carried from Login to Signup
 * and, for an emailed confirmation link, across the trip to the inbox.
 */
const DEFAULT_NEXT = '/messages';
const STORAGE_KEY = 'vybora.auth.next';
/** A remembered destination is only good for this sign-up, not a week later. */
const REMEMBER_MS = 24 * 60 * 60 * 1000;

/** Only allow same-origin relative redirects. */
export function safeNext(next: string | null | undefined): string {
  // `//host` and `/\host` are both protocol-relative to a browser.
  if (!next || !next.startsWith('/') || next.startsWith('//') || next.startsWith('/\\'))
    return DEFAULT_NEXT;
  return next;
}

/** `path`, carrying a meaningful `next` along (nothing for the default or an unsafe one). */
export function withNext(path: string, next: string | null | undefined): string {
  const safe = safeNext(next);
  return safe === DEFAULT_NEXT ? path : `${path}?next=${encodeURIComponent(safe)}`;
}

/**
 * Sign-up with email confirmation: the link opens `/auth/callback` (on this
 * device), which can't carry `?next=` through the redirect allow-list, so the
 * destination waits in this browser for it.
 */
export function rememberNext(next: string | null | undefined): void {
  const safe = safeNext(next);
  try {
    if (safe === DEFAULT_NEXT) localStorage.removeItem(STORAGE_KEY);
    else localStorage.setItem(STORAGE_KEY, JSON.stringify({ next: safe, at: Date.now() }));
  } catch {
    /* storage unavailable: the callback goes to the default */
  }
}

/** The remembered destination (once: it is cleared), or the default. */
export function takeRememberedNext(now = Date.now()): string {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    localStorage.removeItem(STORAGE_KEY);
    if (!raw) return DEFAULT_NEXT;
    const { next, at } = JSON.parse(raw) as { next?: unknown; at?: unknown };
    if (typeof next !== 'string' || typeof at !== 'number' || now - at > REMEMBER_MS)
      return DEFAULT_NEXT;
    return safeNext(next);
  } catch {
    return DEFAULT_NEXT;
  }
}

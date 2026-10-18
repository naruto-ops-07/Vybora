/**
 * Development only: print the raw error behind a friendly message, so the real
 * cause (e.g. a Supabase Auth code) is visible in the console. Never runs in
 * production builds. Pass errors only, never message text or credentials.
 */
export function logDevError(scope: string, error: unknown): void {
  if (import.meta.env.DEV && import.meta.env.MODE !== 'test') console.warn(`[${scope}]`, error);
}

/**
 * Development only: print the raw error behind a friendly message (shown in the
 * Metro terminal), so the real cause (e.g. a Supabase Auth code) is visible.
 * Silent in release builds and tests. Pass errors only, never message text or credentials.
 */
export function logDevError(scope: string, error: unknown): void {
  if (__DEV__ && process.env.NODE_ENV !== 'test') console.warn(`[${scope}]`, error);
}

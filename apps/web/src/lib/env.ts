import { publicEnvSchema, type PublicEnv } from '@vybora/validation';

export type EnvResult = { ok: true; env: PublicEnv } | { ok: false; problems: string[] };

/** Validate public configuration once at startup; the app renders a setup screen if invalid. */
export function readEnv(source: Record<string, string | undefined> = import.meta.env): EnvResult {
  const parsed = publicEnvSchema.safeParse({
    supabaseUrl: source.VITE_SUPABASE_URL,
    supabaseAnonKey: source.VITE_SUPABASE_ANON_KEY,
    siteUrl: source.VITE_SITE_URL || undefined,
  });
  if (parsed.success) return { ok: true, env: parsed.data };
  return {
    ok: false,
    problems: parsed.error.issues.map((i) => {
      const key = {
        supabaseUrl: 'VITE_SUPABASE_URL',
        supabaseAnonKey: 'VITE_SUPABASE_ANON_KEY',
        siteUrl: 'VITE_SITE_URL',
      }[String(i.path[0]) as 'supabaseUrl'];
      return `${key ?? i.path.join('.')}: ${i.message}`;
    }),
  };
}

export const envResult = readEnv();

export function siteUrl(): string {
  if (envResult.ok && envResult.env.siteUrl) return envResult.env.siteUrl.replace(/\/$/, '');
  return window.location.origin;
}

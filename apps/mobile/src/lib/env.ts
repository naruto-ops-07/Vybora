import { publicEnvSchema } from '@vybora/validation';

// EXPO_PUBLIC_* values are inlined at build time; they must be referenced statically.
const parsed = publicEnvSchema.safeParse({
  supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL,
  supabaseAnonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
  siteUrl: process.env.EXPO_PUBLIC_SITE_URL || undefined,
});

export const envOk = parsed.success;
export const envProblems = parsed.success
  ? []
  : parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`);
export const env = parsed.success
  ? parsed.data
  : {
      supabaseUrl: 'http://invalid.localhost',
      supabaseAnonKey: 'missing-anon-key-placeholder',
      siteUrl: undefined,
    };

export const siteUrl = (env.siteUrl ?? 'https://vybora.app').replace(/\/$/, '');

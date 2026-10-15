import { createClient } from '@supabase/supabase-js';
import { createSignedUrlBatcher, type VyboraClient } from '@vybora/api';
import type { Database } from '@vybora/types';
import { envResult } from './env';

// When configuration is missing the app shows a setup screen and never calls
// these; placeholder values keep module initialization side-effect free.
const url = envResult.ok ? envResult.env.supabaseUrl : 'http://invalid.localhost';
const anonKey = envResult.ok ? envResult.env.supabaseAnonKey : 'missing-anon-key-placeholder';

export const supabase: VyboraClient = createClient<Database>(url, anonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    flowType: 'pkce',
  },
});

export const supabaseConfig = { url, anonKey };

export const signedMedia = createSignedUrlBatcher(supabase, 'media');
export const signedDm = createSignedUrlBatcher(supabase, 'dm');

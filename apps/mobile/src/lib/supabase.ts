import 'expo-sqlite/localStorage/install';
import { createClient } from '@supabase/supabase-js';
import { createSignedUrlBatcher, type VyboraClient } from '@vybora/api';
import type { Database } from '@vybora/types';
import { AppState } from 'react-native';
import { env } from './env';

/** Session persisted with expo-sqlite's localStorage shim (Expo's recommended adapter). */
export const supabase: VyboraClient = createClient<Database>(env.supabaseUrl, env.supabaseAnonKey, {
  auth: {
    storage: localStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
    flowType: 'pkce',
  },
});

export const supabaseConfig = { url: env.supabaseUrl, anonKey: env.supabaseAnonKey };

// Only refresh tokens while the app is in the foreground.
AppState.addEventListener('change', (state) => {
  if (state === 'active') void supabase.auth.startAutoRefresh();
  else void supabase.auth.stopAutoRefresh();
});

export const signedMedia = createSignedUrlBatcher(supabase, 'media');
export const signedDm = createSignedUrlBatcher(supabase, 'dm');

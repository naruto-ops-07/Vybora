import * as Linking from 'expo-linking';

/**
 * Where the link in a sign-up or sign-in code email opens the app: the
 * vybora:// scheme (allow-listed in Supabase Auth), a fallback to typing the
 * code.
 */
export function authCallbackUrl(): string {
  return Linking.createURL('/auth/callback');
}

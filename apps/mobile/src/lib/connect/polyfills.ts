/**
 * Must be imported before anything that touches cryptography.
 * Hermes has no `crypto.getRandomValues`; expo-crypto provides a CSPRNG backed
 * by the OS (SecRandomCopyBytes / SecureRandom). Hermes has no `crypto.subtle`
 * either: install @vybora/e2ee's audited-noble adapter now (not lazily), so
 * supabase-js finds SHA-256 for its PKCE code challenge instead of falling
 * back to the weaker "plain" method, and the MLS stack finds it later.
 */
import { ensureSubtle } from '@vybora/e2ee/src/subtle';
import { getRandomValues } from 'expo-crypto';

const g = globalThis as { crypto?: { getRandomValues?: unknown } };
if (!g.crypto) (g as { crypto: object }).crypto = {};
if (!g.crypto!.getRandomValues) {
  Object.defineProperty(g.crypto, 'getRandomValues', {
    value: getRandomValues,
    configurable: true,
  });
}
// Native WebCrypto is kept where it exists; the adapter only fills the gap.
ensureSubtle();

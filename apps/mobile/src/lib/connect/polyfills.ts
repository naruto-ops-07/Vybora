/**
 * Must be imported before anything that touches cryptography.
 * Hermes has no `crypto.getRandomValues`; expo-crypto provides a CSPRNG backed
 * by the OS (SecRandomCopyBytes / SecureRandom). The MLS stack's WebCrypto
 * needs are covered by @vybora/e2ee's audited-noble adapter (installed lazily).
 */
import { getRandomValues } from 'expo-crypto';

const g = globalThis as { crypto?: { getRandomValues?: unknown } };
if (!g.crypto) (g as { crypto: object }).crypto = {};
if (!g.crypto!.getRandomValues) {
  Object.defineProperty(g.crypto, 'getRandomValues', {
    value: getRandomValues,
    configurable: true,
  });
}

import { getCiphersuiteFromName, nobleCryptoProvider, type CiphersuiteImpl } from 'ts-mls';
import { ensureSubtle, nativeSupportsCurve25519 } from './subtle';

/**
 * MLS ciphersuite 3 (RFC 9420): X25519 key exchange, ChaCha20-Poly1305 AEAD,
 * SHA-256, Ed25519 signatures. ChaCha20 is fast on phones without AES
 * hardware and has no timing side channels in software.
 */
export const CIPHERSUITE = 'MLS_128_DHKEMX25519_CHACHA20POLY1305_SHA256_Ed25519' as const;
export const PROTOCOL_VERSION = 1;

let implPromise: Promise<CiphersuiteImpl> | null = null;
let backend: 'native' | 'adapter' | null = null;

/**
 * The ciphersuite implementation (memoized). Uses native WebCrypto when it
 * supports Ed25519/X25519, otherwise installs the audited-noble adapter.
 */
export function getSuite(): Promise<CiphersuiteImpl> {
  if (!implPromise) {
    implPromise = (async () => {
      backend = ensureSubtle();
      if (backend === 'native' && !(await nativeSupportsCurve25519())) backend = ensureSubtle(true);
      return nobleCryptoProvider.getCiphersuiteImpl(getCiphersuiteFromName(CIPHERSUITE));
    })();
    implPromise.catch(() => {
      implPromise = null; // allow a retry after a transient failure
    });
  }
  return implPromise;
}

/** Which WebCrypto backend is in use (for diagnostics in the security center). */
export function cryptoBackend(): 'native' | 'adapter' | null {
  return backend;
}

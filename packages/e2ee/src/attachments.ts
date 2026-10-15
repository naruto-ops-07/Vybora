import { xchacha20poly1305 } from '@noble/ciphers/chacha.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { b64, equalBytes, randomBytes } from './codec';

export const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024;

/**
 * Encrypt a file before upload. Storage only ever receives ciphertext; the
 * random content key travels inside the (MLS-encrypted) message payload.
 */
export function encryptAttachment(plaintext: Uint8Array): {
  ciphertext: Uint8Array;
  key: string;
  nonce: string;
  sha256: string;
} {
  if (plaintext.length > MAX_ATTACHMENT_BYTES) throw new Error('attachment_too_large');
  const key = randomBytes(32);
  const nonce = randomBytes(24);
  const ciphertext = xchacha20poly1305(key, nonce).encrypt(plaintext);
  return {
    ciphertext,
    key: b64.encode(key),
    nonce: b64.encode(nonce),
    sha256: b64.encode(sha256(ciphertext)),
  };
}

/** Verify integrity (digest + AEAD tag) and decrypt a downloaded attachment. */
export function decryptAttachment(
  ciphertext: Uint8Array,
  ref: { key: string; nonce: string; sha256: string },
): Uint8Array {
  if (!equalBytes(sha256(ciphertext), b64.decode(ref.sha256)))
    throw new Error('attachment_digest_mismatch');
  return xchacha20poly1305(b64.decode(ref.key), b64.decode(ref.nonce)).decrypt(ciphertext);
}

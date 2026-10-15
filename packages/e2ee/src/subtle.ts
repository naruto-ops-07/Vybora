/**
 * A narrow WebCrypto `SubtleCrypto` adapter backed by the audited @noble
 * libraries. It exists because React Native's Hermes engine has no
 * `crypto.subtle`, while the MLS stack (ts-mls / @hpke/core) requires one.
 *
 * Scope is deliberately limited to the exact operations the MLS ciphersuite
 * uses (captured by tracing a full protocol run): Ed25519, X25519,
 * HMAC-SHA-256/384/512, HKDF and SHA digests. Anything else throws
 * NotSupportedError instead of guessing. No cryptographic primitive is
 * implemented here — only WebCrypto key formats and call semantics.
 *
 * Correctness is verified by differential tests against Node's native
 * WebCrypto (src/__tests__/subtle.test.ts) and by full MLS interop between a
 * native-WebCrypto party and an adapter party.
 */
import { ed25519, x25519 } from '@noble/curves/ed25519.js';
import { hkdf } from '@noble/hashes/hkdf.js';
import { hmac } from '@noble/hashes/hmac.js';
import { sha256, sha384, sha512 } from '@noble/hashes/sha2.js';
import { base64urlnopad } from '@scure/base';

type Hash = typeof sha256;
type AlgName = 'Ed25519' | 'X25519' | 'HMAC' | 'HKDF';
type KeyType = 'public' | 'private' | 'secret';

const KEY_BYTES = Symbol('vybora.keyBytes');

class NotSupportedError extends Error {
  override name = 'NotSupportedError';
}
class InvalidAccessError extends Error {
  override name = 'InvalidAccessError';
}
class OperationError extends Error {
  override name = 'OperationError';
}

/** Minimal CryptoKey look-alike; raw key material is held behind a symbol. */
export class AdapterKey {
  readonly [KEY_BYTES]: Uint8Array;
  constructor(
    readonly type: KeyType,
    readonly algorithm: Record<string, unknown> & { name: AlgName },
    readonly extractable: boolean,
    readonly usages: string[],
    bytes: Uint8Array,
  ) {
    this[KEY_BYTES] = bytes;
  }
}

// RFC 8410 PKCS#8 prefixes for 32-byte OKP private keys.
const PKCS8_PREFIX: Record<'Ed25519' | 'X25519', Uint8Array> = {
  Ed25519: Uint8Array.from([
    0x30, 0x2e, 0x02, 0x01, 0x00, 0x30, 0x05, 0x06, 0x03, 0x2b, 0x65, 0x70, 0x04, 0x22, 0x04, 0x20,
  ]),
  X25519: Uint8Array.from([
    0x30, 0x2e, 0x02, 0x01, 0x00, 0x30, 0x05, 0x06, 0x03, 0x2b, 0x65, 0x6e, 0x04, 0x22, 0x04, 0x20,
  ]),
};

function bytesOf(data: unknown): Uint8Array {
  if (data instanceof Uint8Array) return new Uint8Array(data);
  if (data instanceof ArrayBuffer) return new Uint8Array(data.slice(0));
  if (ArrayBuffer.isView(data))
    return new Uint8Array(data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength));
  throw new TypeError('Expected a BufferSource');
}

function buffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.slice().buffer as ArrayBuffer;
}

function algName(alg: unknown): string {
  return typeof alg === 'string' ? alg : String((alg as { name?: unknown })?.name ?? '');
}

function hashFn(hash: unknown): Hash {
  switch (algName(hash).toUpperCase()) {
    case 'SHA-256':
      return sha256;
    case 'SHA-384':
      return sha384 as unknown as Hash;
    case 'SHA-512':
      return sha512 as unknown as Hash;
    default:
      throw new NotSupportedError(`Unsupported hash: ${algName(hash)}`);
  }
}

function hashName(hash: unknown): string {
  return algName(hash).toUpperCase();
}

function keyBytes(key: unknown, alg: AlgName, type: KeyType, usage: string): Uint8Array {
  if (!(key instanceof AdapterKey))
    throw new InvalidAccessError('Key was not created by this adapter');
  if (key.algorithm.name !== alg || key.type !== type)
    throw new InvalidAccessError(`Expected ${type} ${alg} key`);
  if (!key.usages.includes(usage))
    throw new InvalidAccessError(`Key usage "${usage}" not permitted`);
  return key[KEY_BYTES];
}

function equalBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i]! ^ b[i]!;
  return diff === 0;
}

function hasPrefix(bytes: Uint8Array, prefix: Uint8Array): boolean {
  return (
    bytes.length === prefix.length + 32 && equalBytes(bytes.subarray(0, prefix.length), prefix)
  );
}

function okpAlgorithm(alg: unknown): 'Ed25519' | 'X25519' | null {
  const n = algName(alg);
  return n === 'Ed25519' || n === 'X25519' ? n : null;
}

function publicFromPrivate(alg: 'Ed25519' | 'X25519', priv: Uint8Array): Uint8Array {
  return alg === 'Ed25519' ? ed25519.getPublicKey(priv) : x25519.getPublicKey(priv);
}

function randomBytes(n: number): Uint8Array {
  const out = new Uint8Array(n);
  globalThis.crypto.getRandomValues(out);
  return out;
}

export const nobleSubtle = {
  async generateKey(algorithm: unknown, extractable: boolean, usages: string[]) {
    const alg = okpAlgorithm(algorithm);
    if (!alg) throw new NotSupportedError(`generateKey: ${algName(algorithm)}`);
    const priv = randomBytes(32);
    const pub = publicFromPrivate(alg, priv);
    const publicUsages = alg === 'Ed25519' ? usages.filter((u) => u === 'verify') : [];
    const privateUsages =
      alg === 'Ed25519'
        ? usages.filter((u) => u === 'sign')
        : usages.filter((u) => u === 'deriveBits' || u === 'deriveKey');
    return {
      publicKey: new AdapterKey('public', { name: alg }, true, publicUsages, pub),
      privateKey: new AdapterKey('private', { name: alg }, extractable, privateUsages, priv),
    };
  },

  async exportKey(format: string, key: unknown) {
    if (!(key instanceof AdapterKey))
      throw new InvalidAccessError('Key was not created by this adapter');
    if (!key.extractable) throw new InvalidAccessError('Key is not extractable');
    const bytes = key[KEY_BYTES];
    const alg = okpAlgorithm(key.algorithm);
    if (format === 'raw') {
      if (key.type === 'private') throw new InvalidAccessError('Cannot export private key as raw');
      return buffer(bytes);
    }
    if (format === 'pkcs8' && alg && key.type === 'private') {
      const out = new Uint8Array(48);
      out.set(PKCS8_PREFIX[alg]);
      out.set(bytes, 16);
      return buffer(out);
    }
    if (format === 'jwk' && alg) {
      const pub = key.type === 'private' ? publicFromPrivate(alg, bytes) : bytes;
      const jwk: Record<string, unknown> = {
        kty: 'OKP',
        crv: alg,
        x: base64urlnopad.encode(pub),
        key_ops: key.usages,
        ext: key.extractable,
      };
      if (key.type === 'private') jwk.d = base64urlnopad.encode(bytes);
      return jwk;
    }
    throw new NotSupportedError(`exportKey: ${format} for ${key.algorithm.name}`);
  },

  async importKey(
    format: string,
    keyData: unknown,
    algorithm: unknown,
    extractable: boolean,
    usages: string[],
  ) {
    const name = algName(algorithm);
    const okp = okpAlgorithm(algorithm);
    if (format === 'raw' && name === 'HMAC') {
      const hash = (algorithm as { hash?: unknown }).hash;
      const bytes = bytesOf(keyData);
      return new AdapterKey(
        'secret',
        { name: 'HMAC', hash: { name: hashName(hash) }, length: bytes.length * 8 },
        extractable,
        usages,
        bytes,
      );
    }
    if (format === 'raw' && name === 'HKDF') {
      return new AdapterKey('secret', { name: 'HKDF' }, false, usages, bytesOf(keyData));
    }
    if (format === 'raw' && okp) {
      const bytes = bytesOf(keyData);
      if (bytes.length !== 32) throw new TypeError(`${okp} public key must be 32 bytes`);
      return new AdapterKey('public', { name: okp }, true, usages, bytes);
    }
    if (format === 'pkcs8' && okp) {
      const bytes = bytesOf(keyData);
      if (!hasPrefix(bytes, PKCS8_PREFIX[okp])) throw new TypeError(`Invalid ${okp} PKCS#8 key`);
      return new AdapterKey('private', { name: okp }, extractable, usages, bytes.slice(16));
    }
    if (format === 'jwk' && okp) {
      const jwk = keyData as { kty?: string; crv?: string; x?: string; d?: string };
      if (jwk.kty !== 'OKP' || jwk.crv !== okp || typeof jwk.x !== 'string')
        throw new TypeError('Invalid OKP JWK');
      const x = base64urlnopad.decode(jwk.x);
      if (typeof jwk.d === 'string') {
        const d = base64urlnopad.decode(jwk.d);
        if (!equalBytes(publicFromPrivate(okp, d), x))
          throw new TypeError('JWK x does not match d');
        return new AdapterKey('private', { name: okp }, extractable, usages, d);
      }
      return new AdapterKey('public', { name: okp }, true, usages, x);
    }
    throw new NotSupportedError(`importKey: ${format} for ${name}`);
  },

  async sign(algorithm: unknown, key: unknown, data: unknown) {
    const name = algName(algorithm);
    if (name === 'Ed25519')
      return buffer(ed25519.sign(bytesOf(data), keyBytes(key, 'Ed25519', 'private', 'sign')));
    if (name === 'HMAC') {
      const k = key as AdapterKey;
      return buffer(
        hmac(hashFn(k.algorithm.hash), keyBytes(key, 'HMAC', 'secret', 'sign'), bytesOf(data)),
      );
    }
    throw new NotSupportedError(`sign: ${name}`);
  },

  async verify(algorithm: unknown, key: unknown, signature: unknown, data: unknown) {
    const name = algName(algorithm);
    if (name === 'Ed25519') {
      try {
        return ed25519.verify(
          bytesOf(signature),
          bytesOf(data),
          keyBytes(key, 'Ed25519', 'public', 'verify'),
        );
      } catch (error) {
        if (error instanceof InvalidAccessError) throw error;
        return false;
      }
    }
    if (name === 'HMAC') {
      const k = key as AdapterKey;
      const expected = hmac(
        hashFn(k.algorithm.hash),
        keyBytes(key, 'HMAC', 'secret', 'verify'),
        bytesOf(data),
      );
      return equalBytes(expected, bytesOf(signature));
    }
    throw new NotSupportedError(`verify: ${name}`);
  },

  async deriveBits(algorithm: unknown, baseKey: unknown, length: number) {
    const name = algName(algorithm);
    if (name === 'X25519') {
      // The peer public key carries no usages in WebCrypto; only type/alg are checked.
      const peer = (algorithm as { public?: unknown }).public;
      if (
        !(peer instanceof AdapterKey) ||
        peer.algorithm.name !== 'X25519' ||
        peer.type !== 'public'
      ) {
        throw new InvalidAccessError('Expected X25519 public key');
      }
      const pub = peer[KEY_BYTES];
      const priv = keyBytes(baseKey, 'X25519', 'private', 'deriveBits');
      let shared: Uint8Array;
      try {
        shared = x25519.getSharedSecret(priv, pub);
      } catch {
        throw new OperationError('X25519 key agreement failed');
      }
      // WebCrypto requires rejecting all-zero results (small-order public keys).
      if (shared.every((b) => b === 0))
        throw new OperationError('X25519 produced an all-zero secret');
      if (length > 256 || length % 8) throw new OperationError('Invalid X25519 length');
      return buffer(shared.slice(0, length / 8));
    }
    if (name === 'HKDF') {
      const a = algorithm as { hash: unknown; salt: unknown; info: unknown };
      if (length % 8) throw new OperationError('HKDF length must be a multiple of 8');
      const ikm = keyBytes(baseKey, 'HKDF', 'secret', 'deriveBits');
      return buffer(hkdf(hashFn(a.hash), ikm, bytesOf(a.salt), bytesOf(a.info), length / 8));
    }
    throw new NotSupportedError(`deriveBits: ${name}`);
  },

  async digest(algorithm: unknown, data: unknown) {
    return buffer(hashFn(algorithm)(bytesOf(data)));
  },

  async encrypt(): Promise<ArrayBuffer> {
    throw new NotSupportedError(
      'encrypt is not provided by the adapter (AEAD uses @noble/ciphers directly)',
    );
  },
  async decrypt(): Promise<ArrayBuffer> {
    throw new NotSupportedError(
      'decrypt is not provided by the adapter (AEAD uses @noble/ciphers directly)',
    );
  },
};

/**
 * Ensure `globalThis.crypto.subtle` exists. Native WebCrypto is always
 * preferred; the adapter is installed only where it is missing (Hermes).
 * Requires `crypto.getRandomValues` to already be available.
 */
export function ensureSubtle(force = false): 'native' | 'adapter' {
  const g = globalThis as { crypto?: { subtle?: unknown; getRandomValues?: unknown } };
  if (!g.crypto?.getRandomValues)
    throw new Error('crypto.getRandomValues is required (install expo-crypto polyfill first)');
  if (g.crypto.subtle === nobleSubtle) return 'adapter';
  if (g.crypto.subtle && !force) return 'native';
  Object.defineProperty(g.crypto, 'subtle', {
    value: nobleSubtle,
    configurable: true,
    enumerable: true,
  });
  return 'adapter';
}

/**
 * Native WebCrypto exists in every modern browser, but Ed25519/X25519 only
 * landed recently (e.g. Safari 17, Chrome 133). Probe both and fall back to
 * the noble adapter when either is missing.
 */
export async function nativeSupportsCurve25519(): Promise<boolean> {
  const subtle = (globalThis as { crypto?: { subtle?: SubtleCrypto } }).crypto?.subtle;
  if (!subtle || subtle === (nobleSubtle as unknown)) return false;
  try {
    await subtle.generateKey({ name: 'Ed25519' }, false, ['sign', 'verify']);
    await subtle.generateKey({ name: 'X25519' }, false, ['deriveBits']);
    return true;
  } catch {
    return false;
  }
}

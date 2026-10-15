import { xchacha20poly1305 } from '@noble/ciphers/chacha.js';
import { randomBytes, utf8 } from './codec';

/**
 * Byte key/value storage for protocol state and decrypted history.
 * Implementations: SQLite (native), IndexedDB (web), memory (tests).
 */
export interface KeyValueStore {
  get(key: string): Promise<Uint8Array | null>;
  set(key: string, value: Uint8Array): Promise<void>;
  delete(key: string): Promise<void>;
  /** Keys starting with `prefix`, in lexicographic order. */
  list(prefix: string): Promise<string[]>;
  /** Remove everything (used on logout / device revocation). */
  clear(): Promise<void>;
}

export class MemoryStore implements KeyValueStore {
  private map = new Map<string, Uint8Array>();
  async get(key: string) {
    const v = this.map.get(key);
    return v ? v.slice() : null;
  }
  async set(key: string, value: Uint8Array) {
    this.map.set(key, value.slice());
  }
  async delete(key: string) {
    this.map.delete(key);
  }
  async list(prefix: string) {
    return [...this.map.keys()].filter((k) => k.startsWith(prefix)).sort();
  }
  async clear() {
    this.map.clear();
  }
  /** Test helper: raw stored bytes (to assert nothing is plaintext at rest). */
  rawValues(): Uint8Array[] {
    return [...this.map.values()];
  }
}

/**
 * Encrypts every value at rest with XChaCha20-Poly1305 under a 32-byte
 * storage key that lives in the platform keystore (iOS Keychain / Android
 * Keystore via expo-secure-store, or a non-extractable key on web). The slot
 * name is bound as associated data so blobs cannot be swapped between keys.
 */
export class EncryptedStore implements KeyValueStore {
  constructor(
    private readonly inner: KeyValueStore,
    private readonly storageKey: Uint8Array,
  ) {
    if (storageKey.length !== 32) throw new Error('Storage key must be 32 bytes');
  }

  async get(key: string) {
    const blob = await this.inner.get(key);
    if (!blob) return null;
    if (blob.length < 24 + 16) throw new Error('Corrupt encrypted record');
    const nonce = blob.subarray(0, 24);
    return xchacha20poly1305(this.storageKey, nonce, utf8.encode(key)).decrypt(blob.subarray(24));
  }

  async set(key: string, value: Uint8Array) {
    const nonce = randomBytes(24);
    const ct = xchacha20poly1305(this.storageKey, nonce, utf8.encode(key)).encrypt(value);
    const blob = new Uint8Array(24 + ct.length);
    blob.set(nonce);
    blob.set(ct, 24);
    await this.inner.set(key, blob);
  }

  delete(key: string) {
    return this.inner.delete(key);
  }
  list(prefix: string) {
    return this.inner.list(prefix);
  }
  clear() {
    return this.inner.clear();
  }
}

export async function getJson<T>(store: KeyValueStore, key: string): Promise<T | null> {
  const v = await store.get(key);
  return v ? (JSON.parse(utf8.decode(v)) as T) : null;
}

export function setJson(store: KeyValueStore, key: string, value: unknown): Promise<void> {
  return store.set(key, utf8.encode(JSON.stringify(value)));
}

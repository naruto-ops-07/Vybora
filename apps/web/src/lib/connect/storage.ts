import { EncryptedStore, type KeyValueStore } from '@vybora/e2ee';

/**
 * Browser storage for VYBORA Connect.
 *
 * Layout (one IndexedDB database per user on this browser profile):
 *   kv   – protocol state + decrypted history, every value sealed by EncryptedStore
 *   meta – a NON-EXTRACTABLE AES-GCM wrapping key (JS can use it but never read
 *          its bytes) and the 32-byte data key encrypted under it.
 *
 * Limits (documented in docs/CONNECT.md): this keeps data encrypted at rest and
 * stops raw-key exfiltration by copying the database, but code running in the
 * page (e.g. an XSS bug) could still use the key while the page is open.
 */
const dbName = (userId: string) => `vybora-connect-${userId}`;

function req<T>(r: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

function open(userId: string): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open(dbName(userId), 1);
    r.onupgradeneeded = () => {
      r.result.createObjectStore('kv');
      r.result.createObjectStore('meta');
    };
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
    r.onblocked = () => reject(new Error('Secure storage is busy in another tab'));
  });
}

function idbStore(db: IDBDatabase): KeyValueStore {
  const tx = (mode: IDBTransactionMode) => db.transaction('kv', mode).objectStore('kv');
  return {
    async get(key) {
      const v = await req(tx('readonly').get(key));
      return v ? new Uint8Array(v as ArrayBuffer) : null;
    },
    async set(key, value) {
      // Store a standalone ArrayBuffer copy (structured clone of a view would keep the whole buffer).
      await req(tx('readwrite').put(value.slice().buffer, key));
    },
    async delete(key) {
      await req(tx('readwrite').delete(key));
    },
    async list(prefix) {
      const keys = await req(tx('readonly').getAllKeys(IDBKeyRange.bound(prefix, `${prefix}￿`)));
      return (keys as string[]).sort();
    },
    async clear() {
      await req(tx('readwrite').clear());
    },
  };
}

async function dataKey(db: IDBDatabase): Promise<Uint8Array> {
  const meta = () => db.transaction('meta', 'readwrite').objectStore('meta');
  let wrapping = (await req(meta().get('wrapping'))) as CryptoKey | undefined;
  const sealed = (await req(meta().get('data'))) as
    { iv: ArrayBuffer; ct: ArrayBuffer } | undefined;
  if (wrapping && sealed) {
    return new Uint8Array(
      await crypto.subtle.decrypt({ name: 'AES-GCM', iv: sealed.iv }, wrapping, sealed.ct),
    );
  }
  wrapping = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, [
    'encrypt',
    'decrypt',
  ]);
  const key = crypto.getRandomValues(new Uint8Array(32));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, wrapping, key);
  await req(meta().put(wrapping, 'wrapping'));
  await req(meta().put({ iv: iv.buffer, ct }, 'data'));
  return key;
}

/** Encrypted-at-rest store for one user's protocol state and decrypted history. */
export async function openSecureStore(userId: string): Promise<KeyValueStore> {
  const db = await open(userId);
  return new EncryptedStore(idbStore(db), await dataKey(db));
}

/** Delete the whole database (keys + history) for this user on this browser. */
export async function destroySecureStore(userId: string): Promise<void> {
  await new Promise<void>((resolve) => {
    const r = indexedDB.deleteDatabase(dbName(userId));
    r.onsuccess = r.onerror = r.onblocked = () => resolve();
  });
}

/**
 * One engine per browser profile: two tabs processing the same MLS group
 * would race on ratchet state. Web Locks give us a cross-tab mutex.
 * Resolves with a release function, or null if another tab holds it.
 */
export function acquireEngineLock(
  userId: string,
  steal = false,
): Promise<{ release: () => void; lost: Promise<void> } | null> {
  const locks = (navigator as Navigator & { locks?: LockManager }).locks;
  if (!locks) {
    return Promise.resolve({ release: () => undefined, lost: new Promise<void>(() => undefined) });
  }
  return new Promise((resolve) => {
    let release!: () => void;
    const held = new Promise<void>((r) => (release = r));
    let signalLost!: () => void;
    const lost = new Promise<void>((r) => (signalLost = r));
    const options: LockOptions = steal ? { steal: true } : { ifAvailable: true };
    locks
      .request(`vybora-connect-${userId}`, options, (lock) => {
        if (!lock) {
          resolve(null);
          return undefined;
        }
        resolve({ release, lost });
        return held;
      })
      .catch(() => signalLost()); // another tab stole the lock
  });
}

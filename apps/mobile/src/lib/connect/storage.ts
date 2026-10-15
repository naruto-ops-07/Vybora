import { b64, EncryptedStore, type KeyValueStore } from '@vybora/e2ee';
import { getRandomBytes } from 'expo-crypto';
import { Directory, Paths } from 'expo-file-system';
import * as SecureStore from 'expo-secure-store';
import * as SQLite from 'expo-sqlite';

/** Raw byte KV over SQLite (values are already encrypted by EncryptedStore). */
async function openSqliteStore(name: string): Promise<KeyValueStore> {
  const db = await SQLite.openDatabaseAsync(name);
  await db.execAsync(
    'PRAGMA journal_mode = WAL; CREATE TABLE IF NOT EXISTS kv (k TEXT PRIMARY KEY NOT NULL, v BLOB NOT NULL);',
  );
  return {
    async get(key) {
      const row = await db.getFirstAsync<{ v: Uint8Array }>('SELECT v FROM kv WHERE k = ?', [key]);
      return row ? new Uint8Array(row.v) : null;
    },
    async set(key, value) {
      await db.runAsync('INSERT OR REPLACE INTO kv (k, v) VALUES (?, ?)', [key, value]);
    },
    async delete(key) {
      await db.runAsync('DELETE FROM kv WHERE k = ?', [key]);
    },
    async list(prefix) {
      const rows = await db.getAllAsync<{ k: string }>(
        'SELECT k FROM kv WHERE k >= ? AND k < ? ORDER BY k',
        [prefix, `${prefix}￿`],
      );
      return rows.map((r) => r.k);
    },
    async clear() {
      await db.runAsync('DELETE FROM kv');
    },
  };
}

const keyName = (userId: string) => `vybora.connect.key.${userId.replace(/-/g, '')}`;
const keychain: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
};

/**
 * 32-byte storage key kept in the iOS Keychain / Android Keystore-backed
 * SecureStore ("this device only": excluded from backups and transfers).
 */
async function storageKey(userId: string): Promise<Uint8Array> {
  const existing = await SecureStore.getItemAsync(keyName(userId), keychain);
  if (existing) return b64.decode(existing);
  const key = getRandomBytes(32);
  await SecureStore.setItemAsync(keyName(userId), b64.encode(key), keychain);
  return key;
}

/** Encrypted-at-rest store for one user's protocol state and decrypted history. */
export async function openSecureStore(userId: string): Promise<KeyValueStore> {
  const inner = await openSqliteStore(`connect-${userId}.db`);
  return new EncryptedStore(inner, await storageKey(userId));
}

/** Destroy the storage key (renders any leftover data unreadable) and decrypted media cache. */
export async function destroySecureStore(userId: string): Promise<void> {
  await SecureStore.deleteItemAsync(keyName(userId), keychain);
  clearMediaCache();
}

/** Temporary decrypted media (video/voice/files need a file to play or share). */
export function mediaCacheDir(): Directory {
  const dir = new Directory(Paths.cache, 'connect-media');
  if (!dir.exists) dir.create({ intermediates: true });
  return dir;
}

export function clearMediaCache() {
  try {
    const dir = new Directory(Paths.cache, 'connect-media');
    if (dir.exists) dir.delete();
  } catch {
    // best effort
  }
}

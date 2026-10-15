import { webcrypto } from 'node:crypto';
import { nobleSubtle } from '../subtle';

/**
 * Switch the global WebCrypto between Node's native implementation ("web")
 * and the noble adapter with no native subtle ("hermes", as on React Native).
 * Lets one test run two parties on different crypto backends.
 */
export type Backend = 'web' | 'hermes';
let current: Backend = 'web';

Object.defineProperty(globalThis, 'crypto', {
  configurable: true,
  value: {
    getRandomValues: <T extends ArrayBufferView>(a: T) =>
      webcrypto.getRandomValues(a as never) as T,
    get subtle() {
      return current === 'web' ? webcrypto.subtle : nobleSubtle;
    },
  },
});

export function useBackend(b: Backend) {
  current = b;
}

/** Run `fn` with a given backend active for every await inside it. */
export async function as<T>(b: Backend, fn: () => Promise<T>): Promise<T> {
  const prev = current;
  current = b;
  try {
    return await fn();
  } finally {
    current = prev;
  }
}

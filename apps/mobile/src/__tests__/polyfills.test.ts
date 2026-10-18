jest.mock('expo-crypto', () => ({
  getRandomValues: <T extends ArrayBufferView>(a: T) => a,
}));

const hex = (buf: ArrayBuffer) =>
  [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');

describe('crypto polyfills', () => {
  const saved = Object.getOwnPropertyDescriptor(globalThis, 'crypto');
  afterEach(() => {
    if (saved) Object.defineProperty(globalThis, 'crypto', saved);
  });

  it('gives Hermes-like runtimes SHA-256 so sign-in links use the sha256 code challenge', async () => {
    // Hermes: no crypto at all.
    Object.defineProperty(globalThis, 'crypto', { value: {}, configurable: true, writable: true });
    jest.isolateModules(() => {
      require('@/lib/connect/polyfills');
    });
    const c = globalThis.crypto as Crypto;
    expect(typeof c.getRandomValues).toBe('function');
    const digest = await c.subtle.digest('SHA-256', new TextEncoder().encode('abc'));
    expect(hex(digest)).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });

  it('keeps native WebCrypto where it already exists', () => {
    const native = { getRandomValues: () => undefined, subtle: { digest: jest.fn() } };
    Object.defineProperty(globalThis, 'crypto', {
      value: native,
      configurable: true,
      writable: true,
    });
    jest.isolateModules(() => {
      require('@/lib/connect/polyfills');
    });
    expect((globalThis.crypto as unknown as typeof native).subtle).toBe(native.subtle);
  });
});

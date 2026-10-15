import { webcrypto } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { nobleSubtle } from '../subtle';

// Differential tests: the adapter must agree byte-for-byte with Node's native WebCrypto.
const native = webcrypto.subtle as unknown as typeof nobleSubtle & SubtleCrypto;
const ad = nobleSubtle;
const rand = (n: number) => webcrypto.getRandomValues(new Uint8Array(n));
const u8 = (b: unknown) => new Uint8Array(b as ArrayBuffer);

describe('HMAC', () => {
  it.each(['SHA-256', 'SHA-384', 'SHA-512'])('matches native for %s', async (hash) => {
    for (let i = 0; i < 25; i++) {
      const key = rand(1 + (i % 64));
      const data = rand(i * 7);
      const alg = { name: 'HMAC', hash, length: key.length * 8 };
      const nk = await native.importKey('raw', key, alg, false, ['sign', 'verify']);
      const ak = await ad.importKey('raw', key, alg, false, ['sign', 'verify']);
      const nSig = u8(await native.sign('HMAC', nk, data));
      expect(u8(await ad.sign('HMAC', ak, data))).toEqual(nSig);
      expect(await ad.verify('HMAC', ak, nSig, data)).toBe(true);
      const bad = nSig.slice();
      bad[0]! ^= 1;
      expect(await ad.verify('HMAC', ak, bad, data)).toBe(false);
    }
  });
});

describe('HKDF', () => {
  it('matches native for the lengths MLS uses', async () => {
    for (const bits of [96, 256, 512]) {
      for (let i = 0; i < 10; i++) {
        const ikm = rand(32);
        const params = { name: 'HKDF', hash: 'SHA-256', salt: rand(i * 3), info: rand(i * 5) };
        const nk = await native.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
        const ak = await ad.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
        expect(u8(await ad.deriveBits(params, ak, bits))).toEqual(
          u8(await native.deriveBits(params, nk, bits)),
        );
      }
    }
  });
});

describe('X25519', () => {
  it('derives identical secrets across implementations (keys imported both ways)', async () => {
    for (let i = 0; i < 10; i++) {
      const a = await ad.generateKey({ name: 'X25519' }, true, ['deriveBits']);
      const n = (await native.generateKey({ name: 'X25519' }, true, [
        'deriveBits',
      ])) as CryptoKeyPair;

      // adapter private key → native, and vice versa
      const aPkcs8 = await ad.exportKey('pkcs8', a.privateKey);
      const nPkcs8 = await native.exportKey('pkcs8', n.privateKey);
      const aPrivInNative = await native.importKey('pkcs8', aPkcs8, { name: 'X25519' }, true, [
        'deriveBits',
      ]);
      const nPrivInAdapter = await ad.importKey('pkcs8', nPkcs8, { name: 'X25519' }, true, [
        'deriveBits',
      ]);
      const aPubRaw = await ad.exportKey('raw', a.publicKey);
      const nPubRaw = await native.exportKey('raw', n.publicKey);
      // Native derives the same public key from the adapter's private key.
      const nativeView = (await native.exportKey('jwk', aPrivInNative)) as JsonWebKey;
      expect((await ad.exportKey('jwk', a.publicKey)) as JsonWebKey).toMatchObject({
        x: nativeView.x,
      });

      const nPubInAdapter = await ad.importKey('raw', nPubRaw, { name: 'X25519' }, true, []);
      const aPubInNative = await native.importKey('raw', aPubRaw, { name: 'X25519' }, true, []);
      const s1 = u8(
        await ad.deriveBits({ name: 'X25519', public: nPubInAdapter }, a.privateKey, 256),
      );
      const s2 = u8(
        await native.deriveBits({ name: 'X25519', public: aPubInNative }, n.privateKey, 256),
      );
      const s3 = u8(
        await native.deriveBits(
          {
            name: 'X25519',
            public: await native.importKey('raw', nPubRaw, { name: 'X25519' }, true, []),
          },
          aPrivInNative,
          256,
        ),
      );
      const s4 = u8(
        await ad.deriveBits(
          {
            name: 'X25519',
            public: await ad.importKey('raw', aPubRaw, { name: 'X25519' }, true, []),
          },
          nPrivInAdapter,
          256,
        ),
      );
      expect(s1).toEqual(s2);
      expect(s1).toEqual(s3);
      expect(s1).toEqual(s4);
    }
  });

  it('exports JWK identically to native', async () => {
    const n = (await native.generateKey({ name: 'X25519' }, true, ['deriveBits'])) as CryptoKeyPair;
    const nJwk = (await native.exportKey('jwk', n.privateKey)) as JsonWebKey;
    const viaAdapter = await ad.importKey(
      'pkcs8',
      await native.exportKey('pkcs8', n.privateKey),
      { name: 'X25519' },
      true,
      ['deriveBits'],
    );
    const aJwk = (await ad.exportKey('jwk', viaAdapter)) as JsonWebKey;
    expect({ d: aJwk.d, x: aJwk.x, crv: aJwk.crv, kty: aJwk.kty }).toEqual({
      d: nJwk.d,
      x: nJwk.x,
      crv: nJwk.crv,
      kty: nJwk.kty,
    });
    const back = await ad.importKey(
      'jwk',
      { kty: 'OKP', crv: 'X25519', x: nJwk.x },
      { name: 'X25519' },
      true,
      [],
    );
    expect(u8(await ad.exportKey('raw', back))).toEqual(
      u8(await native.exportKey('raw', n.publicKey)),
    );
  });

  it('rejects small-order public keys (all-zero shared secret), like WebCrypto', async () => {
    const a = await ad.generateKey({ name: 'X25519' }, true, ['deriveBits']);
    const zeroPoint = await ad.importKey('raw', new Uint8Array(32), { name: 'X25519' }, true, []);
    await expect(
      ad.deriveBits({ name: 'X25519', public: zeroPoint }, a.privateKey, 256),
    ).rejects.toThrow();
  });
});

describe('Ed25519', () => {
  it('produces identical deterministic signatures and cross-verifies', async () => {
    for (let i = 0; i < 10; i++) {
      const n = (await native.generateKey({ name: 'Ed25519' }, true, [
        'sign',
        'verify',
      ])) as CryptoKeyPair;
      const pkcs8 = await native.exportKey('pkcs8', n.privateKey);
      const aPriv = await ad.importKey('pkcs8', pkcs8, 'Ed25519', false, ['sign']);
      const msg = rand(1 + i * 31);
      const nSig = u8(await native.sign('Ed25519', n.privateKey, msg));
      const aSig = u8(await ad.sign('Ed25519', aPriv, msg));
      expect(aSig).toEqual(nSig);

      const aPair = await ad.generateKey('Ed25519', true, ['sign', 'verify']);
      const sig = await ad.sign('Ed25519', aPair.privateKey, msg);
      const pubInNative = await native.importKey(
        'raw',
        await ad.exportKey('raw', aPair.publicKey),
        'Ed25519',
        false,
        ['verify'],
      );
      expect(await native.verify('Ed25519', pubInNative, sig, msg)).toBe(true);
      expect(u8(await ad.exportKey('pkcs8', aPair.privateKey)).length).toBe(48);
      const tampered = u8(sig).slice();
      tampered[10]! ^= 0xff;
      const aPub = await ad.importKey(
        'raw',
        await ad.exportKey('raw', aPair.publicKey),
        'Ed25519',
        false,
        ['verify'],
      );
      expect(await ad.verify('Ed25519', aPub, tampered, msg)).toBe(false);
    }
  });
});

describe('key hygiene', () => {
  it('refuses to export non-extractable keys and private keys as raw', async () => {
    const pair = await ad.generateKey('Ed25519', false, ['sign', 'verify']);
    await expect(ad.exportKey('pkcs8', pair.privateKey)).rejects.toThrow(/not extractable/);
    const ext = await ad.generateKey('Ed25519', true, ['sign', 'verify']);
    await expect(ad.exportKey('raw', ext.privateKey)).rejects.toThrow();
  });

  it('enforces key usages and algorithms', async () => {
    const hmacKey = await ad.importKey('raw', rand(32), { name: 'HMAC', hash: 'SHA-256' }, false, [
      'verify',
    ]);
    await expect(ad.sign('HMAC', hmacKey, rand(4))).rejects.toThrow(/usage/);
    const ed = await ad.generateKey('Ed25519', true, ['sign', 'verify']);
    await expect(
      ad.deriveBits({ name: 'X25519', public: ed.publicKey }, ed.privateKey, 256),
    ).rejects.toThrow();
  });

  it('throws NotSupported for anything outside the MLS profile', async () => {
    await expect(ad.generateKey({ name: 'RSA-PSS' }, true, ['sign'])).rejects.toThrow(
      /generateKey/,
    );
    await expect(ad.encrypt()).rejects.toThrow();
    await expect(ad.digest('MD5', rand(4))).rejects.toThrow();
  });

  it('digests match native', async () => {
    for (const alg of ['SHA-256', 'SHA-384', 'SHA-512']) {
      const d = rand(100);
      expect(u8(await ad.digest(alg, d))).toEqual(u8(await native.digest(alg, d)));
    }
  });
});

describe('backend selection', () => {
  it('detects native Curve25519 support and falls back when it is missing', async () => {
    const { nativeSupportsCurve25519, ensureSubtle } = await import('../subtle');
    const g = globalThis as { crypto: Crypto };
    const original = Object.getOwnPropertyDescriptor(g.crypto, 'subtle');
    try {
      expect(await nativeSupportsCurve25519()).toBe(true); // Node 20+ WebCrypto
      const legacy = {
        generateKey: () =>
          Promise.reject(new DOMException('Unrecognized name', 'NotSupportedError')),
      };
      Object.defineProperty(g.crypto, 'subtle', { value: legacy, configurable: true });
      expect(await nativeSupportsCurve25519()).toBe(false);
      expect(ensureSubtle(true)).toBe('adapter');
      expect(g.crypto.subtle).toBe(nobleSubtle);
      expect(ensureSubtle()).toBe('adapter');
    } finally {
      if (original) Object.defineProperty(g.crypto, 'subtle', original);
      else delete (g.crypto as { subtle?: unknown }).subtle;
    }
  });
});

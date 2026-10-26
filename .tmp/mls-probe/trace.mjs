// Record every WebCrypto.subtle call made during a full MLS flow (suite 3, noble provider).
const real = globalThis.crypto;
const calls = new Map();
const subtle = new Proxy(real.subtle, {
  get(target, prop) {
    const v = target[prop];
    if (typeof v !== 'function') return v;
    return (...args) => {
      const alg = args.find((a) => a && typeof a === 'object' && 'name' in a)?.name ?? (typeof args[0] === 'string' ? args[0] : '');
      const key = `${String(prop)}(${alg})`;
      calls.set(key, (calls.get(key) ?? 0) + 1);
      return v.apply(target, args);
    };
  },
});
Object.defineProperty(globalThis, 'crypto', { value: { getRandomValues: (a) => real.getRandomValues(a), subtle }, configurable: true });

const mls = await import('ts-mls');
const impl = await mls.nobleCryptoProvider.getCiphersuiteImpl(mls.getCiphersuiteFromName('MLS_128_DHKEMX25519_CHACHA20POLY1305_SHA256_Ed25519'));
const enc = new TextEncoder();
const dev = async (n) => {
  const kp = await impl.signature.keygen();
  return mls.generateKeyPackageWithKey({ credentialType: 'basic', identity: enc.encode(n) }, mls.defaultCapabilities(), mls.defaultLifetime, [], kp, impl);
};
const a = await dev('a'), b = await dev('b');
let A = await mls.createGroup(enc.encode('g'), a.publicPackage, a.privatePackage, [], impl);
const c = await mls.createCommit({ state: A, cipherSuite: impl }, { ratchetTreeExtension: true, extraProposals: [{ proposalType: 'add', add: { keyPackage: b.publicPackage } }] });
A = c.newState;
let B = await mls.joinGroup(c.welcome, b.publicPackage, b.privatePackage, mls.emptyPskIndex, impl);
const m = await mls.createApplicationMessage(A, enc.encode('hi'), impl);
const r = await mls.processPrivateMessage(B, m.privateMessage, mls.emptyPskIndex, impl);
console.log('decrypted:', new TextDecoder().decode(r.message));
console.log('subtle calls:', Object.fromEntries(calls));

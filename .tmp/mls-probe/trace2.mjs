// Print each distinct WebCrypto call *shape* (method, formats, algorithm params, usages).
const real = globalThis.crypto;
const seen = new Set();
const desc = (a) => {
  if (a instanceof ArrayBuffer || ArrayBuffer.isView(a)) return `bytes[${a.byteLength}]`;
  if (a && typeof a === 'object' && 'type' in a && 'algorithm' in a) return `Key(${a.type},${JSON.stringify(a.algorithm)},ext=${a.extractable},${a.usages})`;
  if (a && typeof a === 'object' && 'publicKey' in a && 'privateKey' in a) return 'KeyPair';
  if (a && typeof a === 'object') return JSON.stringify(a, (k, v) => (v instanceof Uint8Array || v instanceof ArrayBuffer ? `bytes[${v.byteLength}]` : v && v.type && v.algorithm ? 'Key' : v));
  return JSON.stringify(a);
};
const subtle = new Proxy(real.subtle, {
  get(t, p) {
    const v = t[p];
    if (typeof v !== 'function') return v;
    return async (...args) => {
      const out = await v.apply(t, args);
      const sig = `${String(p)}(${args.map(desc).join(', ')}) -> ${desc(out)}`;
      if (!seen.has(sig)) { seen.add(sig); console.log(sig); }
      return out;
    };
  },
});
Object.defineProperty(globalThis, 'crypto', { value: { getRandomValues: (a) => real.getRandomValues(a), subtle }, configurable: true });
const mls = await import('ts-mls');
const impl = await mls.nobleCryptoProvider.getCiphersuiteImpl(mls.getCiphersuiteFromName('MLS_128_DHKEMX25519_CHACHA20POLY1305_SHA256_Ed25519'));
const enc = new TextEncoder();
const dev = async (n) => mls.generateKeyPackageWithKey({ credentialType: 'basic', identity: enc.encode(n) }, mls.defaultCapabilities(), mls.defaultLifetime, [], await impl.signature.keygen(), impl);
const a = await dev('a'), b = await dev('b'), c = await dev('c');
let A = await mls.createGroup(enc.encode('g'), a.publicPackage, a.privatePackage, [], impl);
let cm = await mls.createCommit({ state: A, cipherSuite: impl }, { ratchetTreeExtension: true, extraProposals: [{ proposalType: 'add', add: { keyPackage: b.publicPackage } }] });
A = cm.newState;
let B = await mls.joinGroup(cm.welcome, b.publicPackage, b.privatePackage, mls.emptyPskIndex, impl);
cm = await mls.createCommit({ state: A, cipherSuite: impl }, { ratchetTreeExtension: true, extraProposals: [{ proposalType: 'add', add: { keyPackage: c.publicPackage } }] });
A = cm.newState;
B = (await mls.processPrivateMessage(B, cm.commit.privateMessage, mls.emptyPskIndex, impl)).newState;
const m = await mls.createApplicationMessage(B, enc.encode('hi'), impl);
const r = await mls.processPrivateMessage(A, m.privateMessage, mls.emptyPskIndex, impl);
console.log('OK', new TextDecoder().decode(r.message), 'epoch', A.groupContext.epoch);

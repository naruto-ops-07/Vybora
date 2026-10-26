// Phase-1 probe: run MLS with WebCrypto.subtle REMOVED (emulates Hermes / Expo Go).
const real = globalThis.crypto;
Object.defineProperty(globalThis, 'crypto', {
  value: { getRandomValues: (a) => real.getRandomValues(a) },
  configurable: true,
});
if (globalThis.crypto.subtle) throw new Error('subtle still present');

const mls = await import('ts-mls');
const { getCiphersuiteFromName, getCiphersuiteImpl, nobleCryptoProvider } = mls;
console.log('getCiphersuiteImpl.length', getCiphersuiteImpl.length, getCiphersuiteImpl.toString().slice(0, 160));

const cs = getCiphersuiteFromName('MLS_128_DHKEMX25519_CHACHA20POLY1305_SHA256_Ed25519');
const impl = await nobleCryptoProvider.getCiphersuiteImpl(cs);
console.log('impl keys', Object.keys(impl), 'sig keys', Object.keys(impl.signature));

const enc = new TextEncoder();
async function device(name) {
  const kp = await impl.signature.keygen();
  console.log('keygen ->', Object.keys(kp));
  const cred = { credentialType: 'basic', identity: enc.encode(name) };
  const pkg = await mls.generateKeyPackageWithKey(cred, mls.defaultCapabilities(), mls.defaultLifetime, [], kp, impl);
  return { kp, pkg };
}
const a = await device('alice');
const b = await device('bob');
const c = await device('carol');

let A = await mls.createGroup(enc.encode('g1'), a.pkg.publicPackage, a.pkg.privatePackage, [], impl);
const commit = await mls.createCommit(
  { state: A, cipherSuite: impl },
  {
    ratchetTreeExtension: true,
    extraProposals: [b, c].map((d) => ({ proposalType: 'add', add: { keyPackage: d.pkg.publicPackage } })),
  },
);
A = commit.newState;
const welcomeBytes = mls.encodeMlsMessage({ welcome: commit.welcome, wireformat: 'mls_welcome', version: 'mls10' });
const w = mls.decodeMlsMessage(welcomeBytes, 0)[0].welcome;
let B = await mls.joinGroup(w, b.pkg.publicPackage, b.pkg.privatePackage, mls.emptyPskIndex, impl);
let C = await mls.joinGroup(w, c.pkg.publicPackage, c.pkg.privatePackage, mls.emptyPskIndex, impl);
console.log('epochs', A.groupContext.epoch, B.groupContext.epoch, C.groupContext.epoch);

const m = await mls.createApplicationMessage(A, enc.encode('hello group'), impl);
A = m.newState;
const wire = mls.encodeMlsMessage({ privateMessage: m.privateMessage, wireformat: 'mls_private_message', version: 'mls10' });
const r = await mls.processPrivateMessage(B, mls.decodeMlsMessage(wire, 0)[0].privateMessage, mls.emptyPskIndex, impl);
console.log('bob got:', new TextDecoder().decode(r.message));

// persistence round trip
const bytes = mls.encodeGroupState(r.newState);
const restored = mls.decodeGroupState(bytes, 0);
console.log('state bytes', bytes.length, 'decoded type', Array.isArray(restored) ? 'tuple' : typeof restored);

// tamper
const t = wire.slice(); t[t.length - 5] ^= 1;
try {
  await mls.processPrivateMessage(C, mls.decodeMlsMessage(t, 0)[0].privateMessage, mls.emptyPskIndex, impl);
  console.log('TAMPER ACCEPTED (bad)');
} catch (e) { console.log('tamper rejected:', e.message.slice(0, 80)); }

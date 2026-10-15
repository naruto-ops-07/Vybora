import { webcrypto } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { as } from './hermes';
import { decryptAttachment, encryptAttachment } from '../attachments';
import { b64, randomId, utf8 } from '../codec';
import {
  commitChanges,
  createGroupState,
  decodeState,
  encodeState,
  encryptApplication,
  epochOf,
  joinFromWelcome,
  makeClientConfig,
  membersOf,
  processIncoming,
  type DirectoryDevice,
} from '../group';
import {
  generateIdentityKeys,
  generateKeyPackages,
  safetyNumber,
  type DeviceIdentity,
  type GeneratedKeyPackage,
} from '../identity';
import { openPayload, sealPayload, type Payload } from '../payload';
import { EncryptedStore, MemoryStore } from '../store';

// A tiny in-memory "server" directory shared by all simulated devices.
const directory = new Map<string, DirectoryDevice>();
const config = makeClientConfig({ lookup: async (id) => directory.get(id) ?? null });

interface Dev {
  identity: DeviceIdentity;
  packages: Map<string, GeneratedKeyPackage>;
}

async function makeDevice(userId = randomId()): Promise<Dev> {
  const keys = await generateIdentityKeys();
  const identity: DeviceIdentity = { userId, deviceId: randomId(), ...keys };
  directory.set(identity.deviceId, {
    deviceId: identity.deviceId,
    userId,
    identityKey: b64.encode(keys.publicKey),
    revoked: false,
  });
  const packages = new Map((await generateKeyPackages(identity, 3)).map((p) => [p.ref, p]));
  return { identity, packages };
}
const anyPackage = (d: Dev) => [...d.packages.values()][0]!;
const text = (body: string): Payload => ({ v: 1, t: 'text', id: randomId(), body });
const conv = randomId();
const keyOf = async (id: string) =>
  directory.get(id) ? b64.decode(directory.get(id)!.identityKey) : null;

describe('MLS on Hermes-like runtime (no native WebCrypto)', () => {
  it('runs a full 3-member group lifecycle with the adapter only', async () => {
    await as('hermes', async () => {
      const [alice, bob, carol] = [await makeDevice(), await makeDevice(), await makeDevice()];
      let A = await createGroupState(alice.identity, conv, config);
      const c1 = await commitChanges(A, {
        add: [anyPackage(bob).publicPackage, anyPackage(carol).publicPackage],
      });
      A = c1.state;
      const find = (d: Dev) => async (ref: string) => d.packages.get(ref) ?? null;
      let B = (await joinFromWelcome(c1.welcome!, find(bob), config)).state;
      let C = (await joinFromWelcome(c1.welcome!, find(carol), config)).state;
      expect([epochOf(A), epochOf(B), epochOf(C)]).toEqual([1, 1, 1]);
      expect(
        membersOf(A)
          .map((m) => m.deviceId)
          .sort(),
      ).toEqual([alice, bob, carol].map((d) => d.identity.deviceId).sort());

      const sealed = sealPayload(
        conv,
        alice.identity.deviceId,
        alice.identity.signKey,
        text('hello from hermes'),
      );
      const msg = await encryptApplication(A, sealed);
      A = msg.state;
      for (const [who, state] of [
        ['bob', B],
        ['carol', C],
      ] as const) {
        const r = await processIncoming(state, msg.ciphertext);
        expect(r.kind).toBe('application');
        if (r.kind !== 'application') return;
        const opened = await openPayload(conv, r.plaintext, keyOf);
        expect(opened.payload).toMatchObject({ t: 'text', body: 'hello from hermes' });
        expect(opened.deviceId).toBe(alice.identity.deviceId);
        if (who === 'bob') B = r.state;
        else C = r.state;
      }

      // Remove carol: she cannot read anything after the commit.
      const carolLeaf = membersOf(A).find((m) => m.deviceId === carol.identity.deviceId)!.leafIndex;
      const c2 = await commitChanges(A, { removeLeaves: [carolLeaf] });
      A = c2.state;
      B = (await processIncoming(B, c2.commit)).state;
      const after = await encryptApplication(
        A,
        sealPayload(conv, alice.identity.deviceId, alice.identity.signKey, text('carol is gone')),
      );
      await expect(processIncoming(C, after.ciphertext)).rejects.toThrow();
      const r = await processIncoming(B, after.ciphertext);
      expect(r.kind).toBe('application');
    });
  });
});

describe('cross-platform interop (native WebCrypto ↔ Hermes adapter)', () => {
  it('web creates the group; a Hermes device joins, replies, and both decrypt', async () => {
    const web = await as('web', () => makeDevice());
    const phone = await as('hermes', () => makeDevice());
    let W = await as('web', async () => {
      const g = await createGroupState(web.identity, conv, config);
      return g;
    });
    const commit = await as('web', () =>
      commitChanges(W, { add: [anyPackage(phone).publicPackage] }),
    );
    W = commit.state;
    let P = (
      await as('hermes', () =>
        joinFromWelcome(commit.welcome!, async (r) => phone.packages.get(r) ?? null, config),
      )
    ).state;

    const m1 = await as('web', () =>
      encryptApplication(
        W,
        sealPayload(conv, web.identity.deviceId, web.identity.signKey, text('web → phone')),
      ),
    );
    W = m1.state;
    const r1 = await as('hermes', () => processIncoming(P, m1.ciphertext));
    if (r1.kind !== 'application') throw new Error('expected app message');
    P = r1.state;
    expect((await openPayload(conv, r1.plaintext, keyOf)).payload).toMatchObject({
      body: 'web → phone',
    });

    const m2 = await as('hermes', () =>
      encryptApplication(
        P,
        sealPayload(conv, phone.identity.deviceId, phone.identity.signKey, text('phone → web')),
      ),
    );
    const r2 = await as('web', () => processIncoming(W, m2.ciphertext));
    if (r2.kind !== 'application') throw new Error('expected app message');
    expect((await openPayload(conv, r2.plaintext, keyOf)).payload).toMatchObject({
      body: 'phone → web',
    });
  });
});

describe('security properties', () => {
  it('rejects tampered ciphertext', async () => {
    const [a, b] = [await makeDevice(), await makeDevice()];
    let A = await createGroupState(a.identity, conv, config);
    const c = await commitChanges(A, { add: [anyPackage(b).publicPackage] });
    A = c.state;
    const B = (await joinFromWelcome(c.welcome!, async (r) => b.packages.get(r) ?? null, config))
      .state;
    const m = await encryptApplication(
      A,
      sealPayload(conv, a.identity.deviceId, a.identity.signKey, text('integrity')),
    );
    const tampered = m.ciphertext.slice();
    tampered[tampered.length - 3]! ^= 0x01;
    await expect(processIncoming(B, tampered)).rejects.toThrow();
  });

  it('rejects a device whose key does not match the server directory (key substitution)', async () => {
    const [a, b] = [await makeDevice(), await makeDevice()];
    // Server lies: directory now lists a different key for bob's device.
    const other = await generateIdentityKeys();
    directory.set(b.identity.deviceId, {
      ...directory.get(b.identity.deviceId)!,
      identityKey: b64.encode(other.publicKey),
    });
    const A = await createGroupState(a.identity, conv, config);
    await expect(commitChanges(A, { add: [anyPackage(b).publicPackage] })).rejects.toThrow();
  });

  it('rejects payloads whose inner signature does not verify (sender spoofing)', async () => {
    const [a, mallory] = [await makeDevice(), await makeDevice()];
    // Mallory signs with her key but claims to be alice's device.
    const forged = sealPayload(
      conv,
      a.identity.deviceId,
      mallory.identity.signKey,
      text('I am alice'),
    );
    await expect(openPayload(conv, forged, keyOf)).rejects.toThrow('bad_sender_signature');
    // A valid payload replayed into another conversation is rejected too.
    const genuine = sealPayload(conv, a.identity.deviceId, a.identity.signKey, text('hi'));
    await expect(openPayload(randomId(), genuine, keyOf)).rejects.toThrow('bad_sender_signature');
  });

  it('does not decrypt a message twice (replay within the group)', async () => {
    const [a, b] = [await makeDevice(), await makeDevice()];
    let A = await createGroupState(a.identity, conv, config);
    const c = await commitChanges(A, { add: [anyPackage(b).publicPackage] });
    A = c.state;
    let B = (await joinFromWelcome(c.welcome!, async (r) => b.packages.get(r) ?? null, config))
      .state;
    const m = await encryptApplication(
      A,
      sealPayload(conv, a.identity.deviceId, a.identity.signKey, text('once')),
    );
    B = (await processIncoming(B, m.ciphertext)).state;
    await expect(processIncoming(B, m.ciphertext)).rejects.toThrow();
  });

  it('persists and restores group state', async () => {
    const [a, b] = [await makeDevice(), await makeDevice()];
    let A = await createGroupState(a.identity, conv, config);
    const c = await commitChanges(A, { add: [anyPackage(b).publicPackage] });
    A = c.state;
    const B = (await joinFromWelcome(c.welcome!, async (r) => b.packages.get(r) ?? null, config))
      .state;
    const restoredB = decodeState(encodeState(B), config);
    const m = await encryptApplication(
      A,
      sealPayload(conv, a.identity.deviceId, a.identity.signKey, text('after restart')),
    );
    const r = await processIncoming(restoredB, m.ciphertext);
    expect(r.kind).toBe('application');
  });

  it('encrypts state at rest and binds records to their slot', async () => {
    const inner = new MemoryStore();
    const store = new EncryptedStore(inner, webcrypto.getRandomValues(new Uint8Array(32)));
    await store.set('m:secret', utf8.encode('the plaintext message'));
    for (const raw of inner.rawValues())
      expect(new TextDecoder().decode(raw)).not.toContain('plaintext');
    expect(utf8.decode((await store.get('m:secret'))!)).toBe('the plaintext message');
    // Moving a blob to another slot breaks authentication.
    await inner.set('m:other', (await inner.get('m:secret'))!);
    await expect(store.get('m:other')).rejects.toThrow();
  });

  it('encrypts attachments and detects corruption', () => {
    const data = webcrypto.getRandomValues(new Uint8Array(5000));
    const enc = encryptAttachment(data);
    expect(decryptAttachment(enc.ciphertext, enc)).toEqual(data);
    const bad = enc.ciphertext.slice();
    bad[0]! ^= 1;
    expect(() => decryptAttachment(bad, enc)).toThrow('attachment_digest_mismatch');
  });

  it('computes symmetric safety numbers that change with keys', () => {
    const a = { userId: 'a', keys: ['k1', 'k2'] };
    const b = { userId: 'b', keys: ['k3'] };
    const n = safetyNumber(a, b);
    expect(n).toMatch(/^(\d{5} ){11}\d{5}$/);
    expect(safetyNumber(b, { userId: 'a', keys: ['k2', 'k1'] })).toBe(n);
    expect(safetyNumber(a, { userId: 'b', keys: ['k4'] })).not.toBe(n);
  });
});

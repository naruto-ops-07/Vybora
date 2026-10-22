import { ed25519 } from '@noble/curves/ed25519.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { b64, randomId, utf8 } from '../codec';
import { ConnectEngine } from '../engine';
import { decodeState, encodeState, encryptApplication, epochOf, makeClientConfig } from '../group';
import { deserializeIdentity, type StoredIdentity } from '../identity';
import { ed25519Seed } from '../payload';
import { getJson, MemoryStore } from '../store';
import { type MemoryServer } from './memoryServer';

export interface TestDevice {
  userId: string;
  engine: ConnectEngine;
  store: MemoryStore;
}

export async function device(server: MemoryServer, userId = randomId()): Promise<TestDevice> {
  const store = new MemoryStore();
  const engine = new ConnectEngine(server.transport(userId), store, {
    userId,
    platform: 'web',
    label: 'test',
  });
  await engine.init();
  return { userId, engine, store };
}

/** A chat with every device synced into the MLS group. */
export async function chat(
  server: MemoryServer,
  kind: 'direct' | 'group',
  owner: TestDevice,
  others: TestDevice[],
): Promise<string> {
  const id = server.createConversation(
    kind,
    owner.userId,
    others.map((o) => o.userId),
  );
  await owner.engine.sync(id);
  for (const o of others) await o.engine.sync(id);
  return id;
}

export async function read(d: TestDevice, conv: string) {
  await d.engine.sync(conv);
  return d.engine.listMessages(conv);
}

/**
 * Act as a NEWER client: sign and encrypt an arbitrary payload object
 * (bypassing this build's schema) through the device's real MLS state.
 */
export async function sendRawPayload(
  server: MemoryServer,
  d: TestDevice,
  conv: string,
  payload: Record<string, unknown> & { id: string },
) {
  await d.engine.sync(conv);
  const identity = deserializeIdentity((await getJson<StoredIdentity>(d.store, 'identity'))!);
  const config = makeClientConfig({ lookup: async () => null });
  const state = decodeState((await d.store.get(`g/${conv}`))!, config);
  const digest = sha256(utf8.encode(JSON.stringify(payload)));
  const input = utf8.encode(
    `vybora-msg-v1|${conv}|${identity.deviceId}|${payload.id}|${b64.encode(digest)}`,
  );
  const sig = ed25519.sign(input, ed25519Seed(identity.signKey));
  const sealed = utf8.encode(
    JSON.stringify({ d: identity.deviceId, s: b64.encode(sig), p: payload }),
  );
  const enc = await encryptApplication(state, sealed);
  await d.store.set(`g/${conv}`, encodeState(enc.state));
  await server.transport(d.userId).postApplication({
    conversationId: conv,
    deviceId: identity.deviceId,
    epoch: epochOf(state),
    ciphertext: b64.encode(enc.ciphertext),
    clientId: payload.id,
    attachmentPaths: [],
  });
}

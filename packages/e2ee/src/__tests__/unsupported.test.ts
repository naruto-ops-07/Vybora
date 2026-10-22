import { describe, expect, it } from 'vitest';
import { randomId } from '../codec';
import { chat, device, read, sendRawPayload } from './flow';
import { MemoryServer } from './memoryServer';

describe('unknown payload kinds (newer client → older client)', () => {
  it('stores a verified unknown kind as an unsupported message instead of failing', async () => {
    const server = new MemoryServer();
    const alice = await device(server);
    const bob = await device(server);
    const conv = await chat(server, 'direct', alice, [bob]);

    const id = randomId();
    await sendRawPayload(server, alice, conv, { v: 1, t: 'hologram', id, beam: [1, 2, 3] });
    await alice.engine.send(conv, { t: 'text', body: 'after' });

    const msgs = await read(bob, conv);
    expect(msgs.map((m) => m.kind)).toEqual(['unsupported', 'text']);
    expect(msgs[0]).toMatchObject({ id, senderId: alice.userId, status: 'received' });
    expect(msgs[0]!.body).toBeUndefined();
  });

  it('accepts known kinds carrying unknown future fields', async () => {
    const server = new MemoryServer();
    const alice = await device(server);
    const bob = await device(server);
    const conv = await chat(server, 'direct', alice, [bob]);
    await sendRawPayload(server, alice, conv, {
      v: 1,
      t: 'text',
      id: randomId(),
      body: 'hi',
      futureField: { x: 1 },
    });
    const msgs = await read(bob, conv);
    expect(msgs.map((m) => [m.kind, m.body])).toEqual([['text', 'hi']]);
  });

  it('still rejects a malformed known kind and an unknown kind with a bad id', async () => {
    const server = new MemoryServer();
    const alice = await device(server);
    const bob = await device(server);
    const conv = await chat(server, 'direct', alice, [bob]);
    await sendRawPayload(server, alice, conv, { v: 1, t: 'text', id: randomId(), body: '' });
    await sendRawPayload(server, alice, conv, { v: 2, t: 'hologram', id: randomId() });
    const msgs = await read(bob, conv);
    expect(msgs.map((m) => m.kind)).toEqual(['undecryptable', 'undecryptable']);
  });
});

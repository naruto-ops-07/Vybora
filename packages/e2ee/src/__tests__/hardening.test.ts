import { describe, expect, it } from 'vitest';
import { randomId } from '../codec';
import { toConnectError } from '../transport';
import { chat, device, read, sendRawPayload } from './flow';
import { MemoryServer } from './memoryServer';

const later = (server: MemoryServer, minutes: number) => {
  const t = Date.now() + minutes * 60_000;
  server.now = () => new Date(t);
};

async function pair(kind: 'direct' | 'group' = 'direct') {
  const server = new MemoryServer();
  const alice = await device(server);
  const bob = await device(server);
  const conv = await chat(server, kind, alice, [bob]);
  return { server, alice, bob, conv };
}

describe('forward-compatibility contract (crit / silent)', () => {
  it('a critical field this build does not know turns the message into a placeholder', async () => {
    const { server, alice, bob, conv } = await pair();
    const id = randomId();
    await sendRawPayload(server, alice, conv, {
      v: 1,
      t: 'text',
      id,
      body: 'disappears in 10s',
      expiresInSec: 10,
      crit: ['expiresInSec'],
    });
    const [m] = await read(bob, conv);
    expect(m).toMatchObject({ id, kind: 'unsupported' });
    expect(m!.body).toBeUndefined(); // never a stripped copy
  });

  it('known critical fields (incl. dotted paths) are fine; unknown dotted ones are not', async () => {
    const { server, alice, bob, conv } = await pair();
    await sendRawPayload(server, alice, conv, {
      v: 1,
      t: 'text',
      id: randomId(),
      body: 'ok',
      crit: ['body'],
    });
    const att = {
      kind: 'image',
      path: `${conv}/x.bin`,
      key: 'k',
      nonce: 'n',
      sha256: 's',
      mime: 'image/png',
      size: 1,
    };
    await sendRawPayload(server, alice, conv, {
      v: 1,
      t: 'attachment',
      id: randomId(),
      attachment: att,
      crit: ['attachment.mime'],
    });
    await sendRawPayload(server, alice, conv, {
      v: 1,
      t: 'attachment',
      id: randomId(),
      attachment: { ...att, blur: true },
      crit: ['attachment.blur'],
    });
    expect((await read(bob, conv)).map((m) => m.kind)).toEqual([
      'text',
      'attachment',
      'unsupported',
    ]);
  });

  it('silent unknown kinds (and silent non-understood ones) are dropped without a bubble', async () => {
    const { server, alice, bob, conv } = await pair();
    await sendRawPayload(server, alice, conv, {
      v: 1,
      t: 'readState',
      id: randomId(),
      silent: true,
    });
    await sendRawPayload(server, alice, conv, {
      v: 1,
      t: 'text',
      id: randomId(),
      body: 'x',
      future: 1,
      crit: ['future'],
      silent: true,
    });
    await alice.engine.send(conv, { t: 'text', body: 'visible' });
    expect((await read(bob, conv)).map((m) => [m.kind, m.body])).toEqual([['text', 'visible']]);
  });

  it('unknown kinds still need a valid signature from the envelope sender', async () => {
    const { server, alice, bob, conv } = await pair();
    await sendRawPayload(
      server,
      alice,
      conv,
      { v: 1, t: 'hologram', id: randomId() },
      {
        badSignature: true,
      },
    );
    // Signed by Bob's own device but posted by Alice: sender mismatch.
    await sendRawPayload(
      server,
      alice,
      conv,
      { v: 1, t: 'hologram', id: randomId() },
      {
        signAs: bob,
      },
    );
    await sendRawPayload(
      server,
      alice,
      conv,
      { v: 1, t: 'readState', id: randomId(), silent: true },
      { badSignature: true },
    );
    expect((await read(bob, conv)).map((m) => m.kind)).toEqual([
      'undecryptable',
      'undecryptable',
      'undecryptable',
    ]);
  });
});

describe('sync robustness', () => {
  it('a transport failure mid-sync loses nothing and does not advance the cursor', async () => {
    const { server, alice, bob, conv } = await pair('group');
    const bodyA = `@[${bob.userId}] one`;
    await alice.engine.send(conv, { t: 'text', body: bodyA, mentions: [bob.userId] });
    await alice.engine.send(conv, { t: 'text', body: 'two' });
    server.failNext.add('getConversation');
    await expect(bob.engine.sync(conv)).rejects.toThrow(/injected/);
    const msgs = await read(bob, conv);
    expect(msgs.map((m) => [m.kind, m.body])).toEqual([
      ['text', bodyA],
      ['text', 'two'],
    ]);
    expect(msgs[0]!.mentions).toEqual([bob.userId]);
  });
});

describe('edit / pin / vote apply only after the server has them', () => {
  it('a failed edit changes nothing locally; a later one applies', async () => {
    const { server, alice, bob, conv } = await pair();
    const m = (await alice.engine.send(conv, { t: 'text', body: 'v1' }))!;
    server.failNext.add('postApplication');
    await expect(alice.engine.edit(conv, m.id, 'v2')).rejects.toThrow(/injected/);
    expect(await alice.engine.getMessage(conv, m.id)).toMatchObject({ body: 'v1' });
    expect((await alice.engine.getMessage(conv, m.id))!.edited).toBeUndefined();
    await alice.engine.edit(conv, m.id, 'v3');
    expect(await alice.engine.getMessage(conv, m.id)).toMatchObject({ body: 'v3', edited: true });
    expect((await read(bob, conv))[0]).toMatchObject({ body: 'v3' });
  });

  it('uses the server createdAt: past the window by server time, nobody applies it', async () => {
    const { server, alice, bob, conv } = await pair();
    const m = (await alice.engine.send(conv, { t: 'text', body: 'v1' }))!;
    later(server, 16); // device clock still says "now"; server says 16 min later
    // Posted (receivers ignore it too), but the caller learns it was too late.
    await expect(alice.engine.edit(conv, m.id, 'late')).rejects.toThrow(/edit_not_allowed/);
    const mine = (await alice.engine.getMessage(conv, m.id))!;
    expect(mine.body).toBe('v1');
    expect((await read(bob, conv))[0]!.body).toBe('v1');
  });

  it('applies our own control when the post response was lost and sync finds it', async () => {
    const { server, alice, bob, conv } = await pair();
    const m = (await alice.engine.send(conv, { t: 'text', body: 'v1' }))!;
    server.failNext.add('postApplicationResponse');
    await expect(alice.engine.edit(conv, m.id, 'v2')).rejects.toThrow(/lost response/);
    expect((await alice.engine.getMessage(conv, m.id))!.body).toBe('v1');
    await alice.engine.sync(conv);
    expect(await alice.engine.getMessage(conv, m.id)).toMatchObject({ body: 'v2', edited: true });
    expect((await read(bob, conv))[0]!.body).toBe('v2');
  });
});

describe('negative rules', () => {
  it('rejects editing a failed message, over-long captions, and an older edit after a newer', async () => {
    const { server, alice, bob, conv } = await pair();
    server.failNext.add('postApplication');
    await expect(alice.engine.send(conv, { t: 'text', body: 'lost' })).rejects.toThrow();
    const failed = (await alice.engine.listMessages(conv)).find((x) => x.status === 'failed')!;
    await expect(alice.engine.edit(conv, failed.id, 'x')).rejects.toThrow(/edit_not_allowed/);

    const pic = (await alice.engine.sendAttachment(
      conv,
      new Uint8Array([1]),
      { kind: 'image', mime: 'image/png' },
      { caption: 'cap' },
    ))!;
    await expect(alice.engine.edit(conv, pic.id, 'c'.repeat(2001))).rejects.toThrow(
      /edit_not_allowed/,
    );
    await alice.engine.edit(conv, pic.id, 'new caption');

    const m = (await alice.engine.send(conv, { t: 'text', body: 'v1' }))!;
    later(server, 5);
    await alice.engine.edit(conv, m.id, 'newer');
    later(server, 2); // a server timestamp that goes backwards
    await sendRawPayload(server, alice, conv, {
      v: 1,
      t: 'edit',
      id: randomId(),
      target: m.id,
      body: 'older',
    });
    const view = await read(bob, conv);
    expect(view.find((x) => x.id === m.id)!.body).toBe('newer');
    expect(view.find((x) => x.id === pic.id)!.caption).toBe('new caption');
  });

  it('ignores votes on non-polls', async () => {
    const { server, alice, bob, conv } = await pair();
    const m = (await alice.engine.send(conv, { t: 'text', body: 'not a poll' }))!;
    await read(bob, conv);
    await expect(bob.engine.vote(conv, m.id, [0])).rejects.toThrow(/vote_not_allowed/);
    await sendRawPayload(server, bob, conv, {
      v: 1,
      t: 'vote',
      id: randomId(),
      target: m.id,
      choices: [0],
    });
    const after = (await read(alice, conv))[0]!;
    expect(after.poll).toBeUndefined();
    expect(after.kind).toBe('text');
  });

  it('ignores a raw pin from a non-admin in an admins-only group; delete unpins', async () => {
    const { server, alice, bob, conv } = await pair('group');
    const a = (await alice.engine.send(conv, { t: 'text', body: 'a' }))!;
    const b = (await alice.engine.send(conv, { t: 'text', body: 'b' }))!;
    await read(bob, conv);
    server.conversations.get(conv)!.policy = 'admins';
    await sendRawPayload(server, bob, conv, {
      v: 1,
      t: 'pin',
      id: randomId(),
      target: a.id,
      pinned: true,
    });
    await read(alice, conv);
    expect(await alice.engine.listPins(conv)).toEqual([]);

    await alice.engine.pin(conv, a.id, true);
    await alice.engine.pin(conv, b.id, true);
    await read(bob, conv);
    expect((await bob.engine.listPins(conv)).map((p) => p.messageId)).toEqual([a.id, b.id]);
    await alice.engine.send(conv, { t: 'delete', target: a.id });
    await read(bob, conv);
    expect((await bob.engine.listPins(conv)).map((p) => p.messageId)).toEqual([b.id]);
    expect((await alice.engine.listPins(conv)).map((p) => p.messageId)).toEqual([b.id]);
  });

  it('drops pins whose message was purged locally', async () => {
    const { alice, conv } = await pair();
    const a = (await alice.engine.send(conv, { t: 'text', body: 'a' }))!;
    await alice.engine.pin(conv, a.id, true);
    await alice.store.delete(`msg/${conv}/${a.id}`); // e.g. disappearing-message purge
    expect(await alice.engine.listPins(conv)).toEqual([]);
  });
});

describe('fix round 2: no member can freeze a chat', () => {
  it('a crafted or mismatched device id becomes a placeholder; later messages still arrive', async () => {
    const { server, alice, bob, conv } = await pair();
    // getDevice('not-a-uuid') is a query error (ConnectError 'unknown') on this server.
    await sendRawPayload(
      server,
      alice,
      conv,
      { v: 1, t: 'text', id: randomId(), body: 'x' },
      {
        d: 'not-a-uuid',
      },
    );
    await sendRawPayload(
      server,
      alice,
      conv,
      { v: 1, t: 'text', id: randomId(), body: 'y' },
      {
        d: randomId(),
      },
    );
    await alice.engine.send(conv, { t: 'text', body: 'still here' });
    const msgs = await read(bob, conv);
    expect(msgs.map((m) => m.kind)).toEqual(['undecryptable', 'undecryptable', 'text']);
    expect(msgs[2]!.body).toBe('still here');
    // Sending still works for everyone (deliver syncs first).
    await bob.engine.send(conv, { t: 'text', body: 'reply' });
    expect((await read(alice, conv)).at(-1)!.body).toBe('reply');
  });

  it('a transient directory failure inside processing aborts the sync; nothing is lost', async () => {
    const { server, alice, bob, conv } = await pair();
    await alice.engine.send(conv, { t: 'text', body: 'hello' });
    // Force a fresh directory lookup during processing.
    (bob.engine as unknown as { directoryCache: Map<string, unknown> }).directoryCache.clear();
    server.failNext.add('getDevice');
    await expect(bob.engine.sync(conv)).rejects.toThrow(/injected getDevice/);
    expect(await bob.engine.listMessages(conv)).toEqual([]);
    const msgs = await read(bob, conv);
    expect(msgs.map((m) => [m.kind, m.body])).toEqual([['text', 'hello']]);
  });

  it('a transient failure on the commit path does not mark the group broken', async () => {
    const { server, alice, bob, conv } = await pair();
    const alice2 = await device(server, alice.userId);
    await alice.engine.sync(conv); // commit adding alice2
    (bob.engine as unknown as { directoryCache: Map<string, unknown> }).directoryCache.clear();
    server.failNext.add('getDevice');
    await expect(bob.engine.sync(conv)).rejects.toThrow();
    expect(await bob.store.get(`g/${conv}`)).not.toBeNull(); // group state kept
    expect((await bob.engine.sync(conv)).status).toBe('ready');
    await alice2.engine.sync(conv);
    await alice2.engine.send(conv, { t: 'text', body: 'from the new device' });
    expect((await read(bob, conv)).map((m) => m.body)).toEqual(['from the new device']);
  });

  it('treats inherited names (constructor, __proto__) in crit as unknown', async () => {
    const { server, alice, bob, conv } = await pair();
    for (const field of [
      'constructor',
      '__proto__',
      'replyTo.toString',
      'attachment.hasOwnProperty',
    ])
      await sendRawPayload(server, alice, conv, {
        v: 1,
        t: 'text',
        id: randomId(),
        body: 'x',
        crit: [field],
      });
    expect((await read(bob, conv)).map((m) => m.kind)).toEqual([
      'unsupported',
      'unsupported',
      'unsupported',
      'unsupported',
    ]);
  });

  it('a control refused by the server leaves no pending records; a lost one keeps them', async () => {
    const { server, alice, conv } = await pair();
    const m = (await alice.engine.send(conv, { t: 'text', body: 'v1' }))!;
    server.failNext.add('postApplicationForbidden');
    await expect(alice.engine.edit(conv, m.id, 'v2')).rejects.toThrow(/injected refusal/);
    expect(await alice.store.list(`pp/${conv}/`)).toEqual([]);
    expect(await alice.store.list(`ob/${conv}/`)).toEqual([]);
    expect((await alice.engine.getMessage(conv, m.id))!.body).toBe('v1');

    server.failNext.add('postApplication'); // network: may have been stored → keep for retry
    await expect(alice.engine.pin(conv, m.id, true)).rejects.toThrow(/injected/);
    expect((await alice.store.list(`pp/${conv}/`)).length).toBe(1);
  });
});

describe('fix round 3: pending controls and transient server errors', () => {
  it("keeps a control's records on 'unknown' (e.g. 502 after commit) and applies it on sync", async () => {
    const { server, alice, bob, conv } = await pair();
    const m = (await alice.engine.send(conv, { t: 'text', body: 'v1' }))!;
    server.postFailures.push({ code: 'unknown', afterStore: true });
    await expect(alice.engine.edit(conv, m.id, 'v2')).rejects.toThrow(/injected unknown/);
    expect((await alice.store.list(`pp/${conv}/`)).length).toBe(1);
    expect((await alice.engine.getMessage(conv, m.id))!.body).toBe('v1');
    expect((await read(bob, conv))[0]!.body).toBe('v2'); // everyone else applies it…
    await alice.engine.sync(conv);
    expect((await alice.engine.getMessage(conv, m.id))!.body).toBe('v2'); // …and so does the sender
    expect(await alice.store.list(`pp/${conv}/`)).toEqual([]);
  });

  it('a reaction or delete that was never stored changes nothing locally and leaves nothing pending', async () => {
    const { server, alice, bob, conv } = await pair();
    const m = (await alice.engine.send(conv, { t: 'text', body: 'hi' }))!;
    await read(bob, conv);
    server.postFailures.push({ code: 'not_ready' });
    await expect(
      bob.engine.send(conv, { t: 'reaction', target: m.id, emoji: '👍' }),
    ).rejects.toThrow(/injected not_ready/);
    expect((await bob.engine.getMessage(conv, m.id))!.reactions).toEqual({});
    server.postFailures.push({ code: 'forbidden' });
    await expect(alice.engine.send(conv, { t: 'delete', target: m.id })).rejects.toThrow();
    expect((await alice.engine.getMessage(conv, m.id))!.deleted).toBeFalsy();
    expect(await alice.store.list(`pp/${conv}/`)).toEqual([]);
    expect(await bob.store.list(`pp/${conv}/`)).toEqual([]);

    // Applied only once the server has it.
    await bob.engine.send(conv, { t: 'reaction', target: m.id, emoji: '👍' });
    expect((await bob.engine.getMessage(conv, m.id))!.reactions).toEqual({ '👍': [bob.userId] });
    expect((await read(alice, conv))[0]!.reactions).toEqual({ '👍': [bob.userId] });
  });

  it('a reaction whose response was lost is kept pending, then applied by sync', async () => {
    const { server, alice, bob, conv } = await pair();
    const m = (await alice.engine.send(conv, { t: 'text', body: 'hi' }))!;
    await read(bob, conv);
    server.failNext.add('postApplicationResponse');
    await expect(
      bob.engine.send(conv, { t: 'reaction', target: m.id, emoji: '🔥' }),
    ).rejects.toThrow();
    expect((await bob.engine.getMessage(conv, m.id))!.reactions).toEqual({});
    await bob.engine.sync(conv);
    expect((await bob.engine.getMessage(conv, m.id))!.reactions).toEqual({ '🔥': [bob.userId] });
  });

  it('drops a control after the epoch retries are exhausted (never stored)', async () => {
    const { server, alice, conv } = await pair();
    const m = (await alice.engine.send(conv, { t: 'text', body: 'v1' }))!;
    for (let i = 0; i < 4; i++) server.postFailures.push({ code: 'epoch_stale' });
    await expect(alice.engine.edit(conv, m.id, 'v2')).rejects.toThrow(/catch up/);
    expect(await alice.store.list(`pp/${conv}/`)).toEqual([]);
    expect(await alice.store.list(`ob/${conv}/`)).toEqual([]);
    expect((await alice.engine.getMessage(conv, m.id))!.body).toBe('v1');
  });

  it('maps 5xx, 429 and statement timeouts to transient by status/code only', () => {
    expect(toConnectError({ message: 'Bad gateway' }, 502).code).toBe('network');
    expect(toConnectError({ message: 'x' }, 503).code).toBe('network');
    expect(toConnectError({ message: 'slow down' }, 429).code).toBe('network');
    expect(toConnectError({ message: 'x', status: 504 }).code).toBe('network'); // storage errors
    expect(toConnectError({ message: 'canceling statement', code: '57014' }, 500).code).toBe(
      'network',
    );
    expect(toConnectError({ message: 'canceling statement', code: '57014' }).code).toBe('network');
    // Message text never makes something transient (or a 4xx a 5xx).
    expect(toConnectError({ message: 'status 503 57014 Bad gateway' }, 400).code).toBe('unknown');
    expect(
      toConnectError({ message: 'invalid input syntax for type uuid', code: '22P02' }, 400).code,
    ).toBe('unknown');
    expect(
      toConnectError({ message: 'new row violates row-level security', code: '42501' }, 403).code,
    ).toBe('forbidden');
  });

  it('a 5xx while receiving aborts the sync instead of leaving a placeholder', async () => {
    const { server, alice, bob, conv } = await pair();
    await alice.engine.send(conv, { t: 'text', body: 'hello' });
    (bob.engine as unknown as { directoryCache: Map<string, unknown> }).directoryCache.clear();
    const t = server.transport(bob.userId);
    const flaky = {
      ...t,
      getDevice: (() => {
        let failed = false;
        return async (id: string) => {
          if (!failed) {
            failed = true;
            throw toConnectError({ message: 'upstream error' }, 503);
          }
          return t.getDevice(id);
        };
      })(),
    };
    (bob.engine as unknown as { transport: typeof t }).transport = flaky;
    await expect(bob.engine.sync(conv)).rejects.toThrow(/upstream/);
    expect((await read(bob, conv)).map((m) => [m.kind, m.body])).toEqual([['text', 'hello']]);
  });
});

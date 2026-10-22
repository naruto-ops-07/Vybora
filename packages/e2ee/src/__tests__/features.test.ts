import { describe, expect, it } from 'vitest';
import { randomId } from '../codec';
import type { LocalMessage } from '../engine';
import { payloadSchema } from '../payload';
import {
  applyPin,
  mayPin,
  mentionTokens,
  normalizeVote,
  validMentions,
  withinEditWindow,
} from '../rules';
import { chat, device, read, sendRawPayload } from './flow';
import { MemoryServer } from './memoryServer';

const byId = (ms: LocalMessage[], id: string) => ms.find((m) => m.id === id)!;
const later = (server: MemoryServer, minutes: number) => {
  const t = Date.now() + minutes * 60_000;
  server.now = () => new Date(t);
};

describe('rules', () => {
  it('edit window is 15 minutes', () => {
    const t0 = '2026-10-22T10:00:00.000Z';
    expect(withinEditWindow(t0, '2026-10-22T10:15:00.000Z')).toBe(true);
    expect(withinEditWindow(t0, '2026-10-22T10:15:00.001Z')).toBe(false);
    expect(withinEditWindow(t0, 'nonsense')).toBe(false);
  });
  it('keeps at most 3 pins, dropping the oldest; re-pin moves to newest', () => {
    let pins = applyPin([], { messageId: 'a', pinned: true, by: 'u', at: '1' });
    for (const id of ['b', 'c', 'd'])
      pins = applyPin(pins, { messageId: id, pinned: true, by: 'u', at: id });
    expect(pins.map((p) => p.messageId)).toEqual(['b', 'c', 'd']);
    pins = applyPin(pins, { messageId: 'b', pinned: true, by: 'u', at: 'z' });
    expect(pins.map((p) => p.messageId)).toEqual(['c', 'd', 'b']);
    expect(
      applyPin(pins, { messageId: 'c', pinned: false, by: 'u', at: 'z' }).map((p) => p.messageId),
    ).toEqual(['d', 'b']);
  });
  it('pin permission follows the group admins-only setting', () => {
    expect(mayPin({ kind: 'direct' }, 'x')).toBe(true);
    expect(mayPin({ kind: 'group', settingsPolicy: 'everyone' }, 'x')).toBe(true);
    expect(mayPin({ kind: 'group', settingsPolicy: 'admins', adminIds: ['a'] }, 'x')).toBe(false);
    expect(mayPin({ kind: 'group', settingsPolicy: 'admins', adminIds: ['a'] }, 'a')).toBe(true);
  });
  it('validates votes', () => {
    const single = { options: ['a', 'b', 'c'], multi: false };
    expect(normalizeVote(single, [1])).toEqual([1]);
    expect(normalizeVote(single, [0, 1])).toBeNull();
    expect(normalizeVote(single, [3])).toBeNull();
    expect(normalizeVote(single, [])).toEqual([]);
    expect(normalizeVote({ ...single, multi: true }, [2, 0, 2])).toEqual([0, 2]);
  });
  it('parses mention tokens and keeps only present members', () => {
    const a = randomId();
    const b = randomId();
    const body = `hi @[${a}] and @[${b}] @[${a}]`;
    expect(mentionTokens(body)).toEqual([a, b]);
    expect(validMentions(body, [a, b, randomId()], [a])).toEqual([a]);
    expect(validMentions('no tokens', [a], [a])).toBeUndefined();
  });
  it('payload schema validates ranges', () => {
    const base = { v: 1, id: randomId() } as const;
    const ok = (p: object) => payloadSchema.safeParse({ ...base, ...p }).success;
    expect(ok({ t: 'location', lat: 51.5, lng: -0.12 })).toBe(true);
    expect(ok({ t: 'location', lat: 91, lng: 0 })).toBe(false);
    expect(ok({ t: 'location', lat: 0, lng: -180.5 })).toBe(false);
    expect(ok({ t: 'poll', question: 'Q', options: ['a'], multi: false })).toBe(false);
    expect(ok({ t: 'poll', question: 'Q', options: ['a', 'A'], multi: false })).toBe(false);
    const thirteen = Array.from({ length: 13 }, (_, i) => `o${i}`);
    expect(ok({ t: 'poll', question: 'Q', options: thirteen, multi: true })).toBe(false);
    expect(ok({ t: 'poll', question: 'Q', options: thirteen.slice(0, 12), multi: true })).toBe(
      true,
    );
    expect(ok({ t: 'contact', userId: randomId(), username: 'maya', displayName: 'Maya' })).toBe(
      true,
    );
  });
});

describe('edit (real engines)', () => {
  it('sender edits within 15 minutes; every client applies it', async () => {
    const server = new MemoryServer();
    const alice = await device(server);
    const bob = await device(server);
    const conv = await chat(server, 'direct', alice, [bob]);
    const sent = (await alice.engine.send(conv, { t: 'text', body: 'helo' }))!;
    await read(bob, conv);

    later(server, 5);
    await alice.engine.edit(conv, sent.id, 'hello');
    const mine = await alice.engine.getMessage(conv, sent.id);
    expect(mine).toMatchObject({ body: 'hello', edited: true });
    const theirs = byId(await read(bob, conv), sent.id);
    expect(theirs).toMatchObject({ body: 'hello', edited: true });
    expect(theirs.editedAt).toBeDefined();
    // The edit itself is not a visible message.
    expect((await bob.engine.listMessages(conv)).length).toBe(1);
  });

  it('rejects edits by someone else and edits after the window, on receive', async () => {
    const server = new MemoryServer();
    const alice = await device(server);
    const bob = await device(server);
    const conv = await chat(server, 'direct', alice, [bob]);
    const sent = (await alice.engine.send(conv, { t: 'text', body: 'original' }))!;
    await read(bob, conv);

    // Bob can't edit Alice's message (sender-side refusal)…
    await expect(bob.engine.edit(conv, sent.id, 'hacked')).rejects.toThrow(/edit_not_allowed/);
    // …and a forged edit from a modified client is ignored by Alice.
    await sendRawPayload(server, bob, conv, {
      v: 1,
      t: 'edit',
      id: randomId(),
      target: sent.id,
      body: 'hacked',
    });
    expect((await read(alice, conv))[0]!.body).toBe('original');

    // After 15 minutes the sender's own (forged-past-the-check) edit is ignored too.
    later(server, 16);
    await sendRawPayload(server, alice, conv, {
      v: 1,
      t: 'edit',
      id: randomId(),
      target: sent.id,
      body: 'too late',
    });
    const view = await read(bob, conv);
    expect(view[0]).toMatchObject({ body: 'original' });
    expect(view[0]!.edited).toBeUndefined();
  });
});

describe('polls and votes (real engines)', () => {
  it('tallies one current vote per member, latest wins, invalid votes ignored', async () => {
    const server = new MemoryServer();
    const alice = await device(server);
    const bob = await device(server);
    const carol = await device(server);
    const conv = await chat(server, 'group', alice, [bob, carol]);
    const poll = (await alice.engine.send(conv, {
      t: 'poll',
      question: 'Dinner?',
      options: ['Pizza', 'Sushi', 'Tacos'],
      multi: false,
    }))!;
    await read(bob, conv);
    await read(carol, conv);

    await bob.engine.vote(conv, poll.id, [0]);
    await bob.engine.vote(conv, poll.id, [1]); // changed mind
    await carol.engine.vote(conv, poll.id, [1]);
    await expect(carol.engine.vote(conv, poll.id, [0, 2])).rejects.toThrow(); // single choice
    await sendRawPayload(server, carol, conv, {
      v: 1,
      t: 'vote',
      id: randomId(),
      target: poll.id,
      choices: [7],
    });
    await alice.engine.vote(conv, poll.id, [2]);

    const p = byId(await read(alice, conv), poll.id).poll!;
    expect(p.votes).toEqual({ [bob.userId]: [1], [carol.userId]: [1], [alice.userId]: [2] });
    expect(byId(await read(bob, conv), poll.id).poll!.votes).toEqual(p.votes);

    await bob.engine.vote(conv, poll.id, []); // withdraw
    expect(byId(await read(carol, conv), poll.id).poll!.votes[bob.userId]).toBeUndefined();
  });
});

describe('view once (real engines)', () => {
  it('the recipient can open it exactly once; the key is then gone', async () => {
    const server = new MemoryServer();
    const alice = await device(server);
    const bob = await device(server);
    const conv = await chat(server, 'direct', alice, [bob]);
    const photo = new TextEncoder().encode('secret photo bytes');
    const sent = (await alice.engine.sendAttachment(conv, photo, {
      kind: 'image',
      mime: 'image/jpeg',
      viewOnce: true,
    }))!;
    // The sender keeps no key for it.
    expect(sent.attachment).toBeUndefined();
    expect(sent.viewOnce).toEqual({ kind: 'image', consumed: true });
    expect(await alice.engine.consumeViewOnce(conv, sent.id)).toBeNull();

    const got = byId(await read(bob, conv), sent.id);
    expect(got.viewOnce).toEqual({ kind: 'image', consumed: false });
    expect(new TextDecoder().decode((await bob.engine.consumeViewOnce(conv, sent.id))!)).toBe(
      'secret photo bytes',
    );
    expect(await bob.engine.consumeViewOnce(conv, sent.id)).toBeNull();
    const after = (await bob.engine.getMessage(conv, sent.id))!;
    expect(after.attachment).toBeUndefined();
    expect(after.viewOnce).toEqual({ kind: 'image', consumed: true });
    expect(JSON.stringify(after)).not.toContain(got.attachment!.key);
    await expect(bob.engine.forward(conv, sent.id, conv)).rejects.toThrow(/not_forwardable/);
  });
});

describe('pins (real engines)', () => {
  it('max 3 per chat; admins-only groups ignore pins from members', async () => {
    const server = new MemoryServer();
    const alice = await device(server);
    const bob = await device(server);
    const conv = await chat(server, 'group', alice, [bob]);
    const ids: string[] = [];
    for (const body of ['a', 'b', 'c', 'd'])
      ids.push((await alice.engine.send(conv, { t: 'text', body }))!.id);
    await read(bob, conv);
    for (const id of ids) await bob.engine.pin(conv, id, true);
    await read(alice, conv);
    expect((await alice.engine.listPins(conv)).map((p) => p.messageId)).toEqual(ids.slice(1));

    server.conversations.get(conv)!.policy = 'admins';
    await alice.engine.sync(conv); // refresh roles/policy
    await bob.engine.sync(conv);
    await expect(bob.engine.pin(conv, ids[1]!, false)).rejects.toThrow(/pin_not_allowed/);
    await sendRawPayload(server, bob, conv, {
      v: 1,
      t: 'pin',
      id: randomId(),
      target: ids[1]!,
      pinned: false,
    });
    await read(alice, conv);
    expect((await alice.engine.listPins(conv)).length).toBe(3);
    await alice.engine.pin(conv, ids[1]!, false);
    await read(bob, conv);
    expect((await bob.engine.listPins(conv)).map((p) => p.messageId)).toEqual(ids.slice(2));
  });
});

describe('mentions, contact, location, forward, search, stars (real engines)', () => {
  it('validates mentions against members on send and receive', async () => {
    const server = new MemoryServer();
    const alice = await device(server);
    const bob = await device(server);
    const conv = await chat(server, 'group', alice, [bob]);
    const stranger = randomId();
    await expect(
      alice.engine.send(conv, {
        t: 'text',
        body: `@[${stranger}] hi`,
        mentions: [stranger],
      }),
    ).rejects.toThrow(/invalid_mentions/);
    await alice.engine.send(conv, {
      t: 'text',
      body: `@[${bob.userId}] hi`,
      mentions: [bob.userId],
    });
    await sendRawPayload(server, alice, conv, {
      v: 1,
      t: 'text',
      id: randomId(),
      body: `@[${stranger}] @[${bob.userId}]`,
      mentions: [stranger, bob.userId],
    });
    const msgs = await read(bob, conv);
    expect(msgs.map((m) => m.mentions)).toEqual([[bob.userId], [bob.userId]]);
  });

  it('sends contact cards and locations; forwards re-encrypt attachments per chat', async () => {
    const server = new MemoryServer();
    const alice = await device(server);
    const bob = await device(server);
    const carol = await device(server);
    const ab = await chat(server, 'direct', alice, [bob]);
    const ac = await chat(server, 'direct', alice, [carol]);

    const card = { userId: carol.userId, username: 'carol', displayName: 'Carol' };
    await alice.engine.send(ab, { t: 'contact', ...card });
    await alice.engine.send(ab, { t: 'location', lat: 48.8584, lng: 2.2945, label: 'Tower' });
    await expect(alice.engine.send(ab, { t: 'location', lat: 120, lng: 0 })).rejects.toThrow();
    const file = (await alice.engine.sendAttachment(
      ab,
      new TextEncoder().encode('doc'),
      { kind: 'file', mime: 'text/plain', name: 'notes.txt' },
      { caption: 'see notes' },
    ))!;
    const bobView = await read(bob, ab);
    expect(bobView[0]).toMatchObject({ kind: 'contact', contact: card });
    expect(bobView[1]).toMatchObject({
      kind: 'location',
      location: { lat: 48.8584, lng: 2.2945, label: 'Tower' },
    });

    const fwd = (await bob.engine.forward(ab, file.id, ab))!; // same chat is fine too
    expect(fwd).toMatchObject({ forwarded: true, caption: 'see notes' });
    const fwdToCarol = (await alice.engine.forward(ab, file.id, ac))!;
    expect(fwdToCarol.attachment!.path.startsWith(`${ac}/`)).toBe(true);
    expect(fwdToCarol.attachment!.key).not.toBe(file.attachment!.key);
    const carolMsg = (await read(carol, ac))[0]!;
    expect(carolMsg).toMatchObject({ kind: 'attachment', forwarded: true });
    expect(new TextDecoder().decode(await carol.engine.openAttachment(carolMsg.attachment!))).toBe(
      'doc',
    );
    // Carol has no access to the original chat's blob.
    await expect(carol.engine.openAttachment(file.attachment!)).rejects.toThrow();

    const t = (await alice.engine.send(ab, { t: 'text', body: `ask @[${bob.userId}]` }))!;
    await alice.engine.forward(ab, t.id, ac, { nameOf: () => 'Bob' });
    expect((await read(carol, ac)).at(-1)).toMatchObject({ body: 'ask @Bob', forwarded: true });
  });

  it('searches local history in one chat and across chats; stars stay local', async () => {
    const server = new MemoryServer();
    const alice = await device(server);
    const bob = await device(server);
    const c1 = await chat(server, 'direct', alice, [bob]);
    const c2 = await chat(server, 'group', alice, [bob]);
    await alice.engine.send(c1, { t: 'text', body: 'Café at noon?' });
    await alice.engine.send(c2, { t: 'text', body: 'cafe tomorrow' });
    await alice.engine.send(c2, {
      t: 'poll',
      question: 'Which café',
      options: ['A', 'B'],
      multi: false,
    });
    await alice.engine.send(c2, { t: 'text', body: 'unrelated' });
    await read(bob, c1);
    await read(bob, c2);

    expect((await bob.engine.searchMessages('CAFE')).length).toBe(3);
    expect(
      (await bob.engine.searchMessages('cafe', { conversationId: c1 })).map((m) => m.body),
    ).toEqual(['Café at noon?']);
    expect(await bob.engine.searchMessages('  ')).toEqual([]);

    const [m] = await bob.engine.listMessages(c1);
    const envelopesBefore = server.envelopes.length;
    await bob.engine.star(c1, m!.id, true);
    expect(server.envelopes.length).toBe(envelopesBefore);
    expect((await bob.engine.listStarred()).map((x) => x.id)).toEqual([m!.id]);
    expect((await bob.engine.getMessage(c1, m!.id))!.starred).toBe(true);
    await bob.engine.star(c1, m!.id, false);
    expect(await bob.engine.listStarred()).toEqual([]);
  });
});

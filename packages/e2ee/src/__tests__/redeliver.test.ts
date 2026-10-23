import { describe, expect, it } from 'vitest';
import { setJson } from '../store';
import { chat, device, read } from './flow';
import { MemoryServer } from './memoryServer';

async function pair() {
  const server = new MemoryServer();
  const alice = await device(server);
  const bob = await device(server);
  const conv = await chat(server, 'direct', alice, [bob]);
  return { server, alice, bob, conv };
}

const pendingIds = async (d: { store: { list(p: string): Promise<string[]> } }, conv: string) =>
  (await d.store.list(`pp/${conv}/`)).map((k) => k.slice(k.lastIndexOf('/') + 1));

describe('queued controls are re-delivered on sync', () => {
  it('a network-failed edit is applied after the next sync; everyone converges', async () => {
    const { server, alice, bob, conv } = await pair();
    const m = (await alice.engine.send(conv, { t: 'text', body: 'v1' }))!;
    server.failNext.add('postApplication'); // never stored
    // Contract: 'network'/'unknown' on a control means "queued, will retry".
    await expect(alice.engine.edit(conv, m.id, 'v2')).rejects.toMatchObject({ code: 'network' });
    expect((await alice.engine.getMessage(conv, m.id))!.body).toBe('v1');
    expect((await pendingIds(alice, conv)).length).toBe(1);

    let events = 0;
    alice.engine.onChange(() => events++);
    await alice.engine.sync(conv);
    expect(events).toBeGreaterThan(0);
    expect(await alice.engine.getMessage(conv, m.id)).toMatchObject({ body: 'v2', edited: true });
    expect(await pendingIds(alice, conv)).toEqual([]);
    expect(await alice.store.list(`pq/${conv}/`)).toEqual([]);
    expect((await read(bob, conv))[0]).toMatchObject({ body: 'v2', edited: true });
  });

  it('a lost response is recognised on sync and never posted twice', async () => {
    const { server, alice, bob, conv } = await pair();
    const m = (await alice.engine.send(conv, { t: 'text', body: 'v1' }))!;
    server.failNext.add('postApplicationResponse'); // stored, reply lost
    await expect(alice.engine.edit(conv, m.id, 'v2')).rejects.toMatchObject({ code: 'network' });
    const [editId] = await pendingIds(alice, conv);
    await alice.engine.sync(conv);
    await alice.engine.sync(conv);
    expect(server.envelopes.filter((e) => e.clientId === editId)).toHaveLength(1);
    expect((await alice.engine.getMessage(conv, m.id))!.body).toBe('v2');
    expect((await read(bob, conv))[0]!.body).toBe('v2');
  });

  it('drops queued records older than 24 hours (or without a queue time) unsent', async () => {
    const { server, alice, bob, conv } = await pair();
    const m = (await alice.engine.send(conv, { t: 'text', body: 'v1' }))!;
    server.failNext.add('postApplication');
    await expect(alice.engine.edit(conv, m.id, 'stale')).rejects.toThrow();
    server.failNext.add('postApplication');
    await expect(alice.engine.pin(conv, m.id, true)).rejects.toThrow();
    const [a, b] = await pendingIds(alice, conv);
    const old = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString();
    await setJson(alice.store, `pq/${conv}/${a}`, old);
    await alice.store.delete(`pq/${conv}/${b}`); // no queue time → stale
    const before = server.envelopes.length;

    await alice.engine.sync(conv);
    expect(server.envelopes.length).toBe(before); // nothing sent
    expect(await pendingIds(alice, conv)).toEqual([]);
    expect(await alice.store.list(`ob/${conv}/`)).toEqual([]);
    expect(await alice.store.list(`pq/${conv}/`)).toEqual([]);
    expect((await alice.engine.getMessage(conv, m.id))!.body).toBe('v1');
    expect(await alice.engine.listPins(conv)).toEqual([]);
    expect((await read(bob, conv))[0]!.body).toBe('v1');
  });

  it('a re-delivery refused by server time is dropped quietly', async () => {
    const { server, alice, bob, conv } = await pair();
    const m = (await alice.engine.send(conv, { t: 'text', body: 'v1' }))!;
    server.failNext.add('postApplication');
    await expect(alice.engine.edit(conv, m.id, 'v2')).rejects.toThrow();
    const t = Date.now() + 16 * 60_000;
    server.now = () => new Date(t); // by the time we're back online, the window has closed
    let events = 0;
    alice.engine.onChange(() => events++);
    await expect(alice.engine.sync(conv)).resolves.toMatchObject({ status: 'ready' });
    expect(events).toBeGreaterThan(0);
    expect(await pendingIds(alice, conv)).toEqual([]);
    expect((await alice.engine.getMessage(conv, m.id))!.body).toBe('v1');
    expect((await read(bob, conv))[0]!.body).toBe('v1');
  });

  it('stays queued while still offline, in send order', async () => {
    const { server, alice, bob, conv } = await pair();
    const m = (await alice.engine.send(conv, { t: 'text', body: 'hi' }))!;
    server.failNext.add('postApplication');
    await expect(alice.engine.pin(conv, m.id, true)).rejects.toThrow();
    server.failNext.add('postApplication');
    await expect(alice.engine.pin(conv, m.id, false)).rejects.toThrow();
    server.failNext.add('postApplication'); // the re-delivery fails too
    await alice.engine.sync(conv);
    expect((await pendingIds(alice, conv)).length).toBe(2);
    await alice.engine.sync(conv); // back online: pin, then unpin
    expect(await pendingIds(alice, conv)).toEqual([]);
    expect(await alice.engine.listPins(conv)).toEqual([]);
    await read(bob, conv);
    expect(await bob.engine.listPins(conv)).toEqual([]);
  });

  it('re-delivers reactions and deletes too; content messages keep their Retry flow', async () => {
    const { server, alice, bob, conv } = await pair();
    const m = (await alice.engine.send(conv, { t: 'text', body: 'hi' }))!;
    await read(bob, conv);
    server.failNext.add('postApplication');
    await expect(
      bob.engine.send(conv, { t: 'reaction', target: m.id, emoji: '👍' }),
    ).rejects.toMatchObject({ code: 'network' });
    await bob.engine.sync(conv);
    expect((await bob.engine.getMessage(conv, m.id))!.reactions).toEqual({ '👍': [bob.userId] });
    expect((await read(alice, conv))[0]!.reactions).toEqual({ '👍': [bob.userId] });

    server.failNext.add('postApplication');
    await expect(alice.engine.send(conv, { t: 'delete', target: m.id })).rejects.toThrow();
    server.failNext.add('postApplication');
    await expect(alice.engine.send(conv, { t: 'text', body: 'unsent' })).rejects.toThrow();
    await alice.engine.sync(conv);
    expect((await alice.engine.getMessage(conv, m.id))!.deleted).toBe(true);
    expect((await read(bob, conv)).find((x) => x.id === m.id)!.deleted).toBe(true);
    // The failed text is not auto-resent: still failed, waiting for Retry.
    const failed = (await alice.engine.listMessages(conv)).find((x) => x.body === 'unsent')!;
    expect(failed.status).toBe('failed');
    expect(server.envelopes.some((e) => e.clientId === failed.id)).toBe(false);
  });
});

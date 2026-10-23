import { afterEach, describe, expect, it, vi } from 'vitest';
import { ConnectEngine } from '../engine';
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

describe('fix round 5: order and pruning', () => {
  afterEach(() => vi.useRealTimers());

  it("pin X fails 'unknown', then unpin X: X ends up unpinned (nothing overtakes)", async () => {
    const { server, alice, bob, conv } = await pair();
    const m = (await alice.engine.send(conv, { t: 'text', body: 'x' }))!;
    server.postFailures.push({ code: 'unknown' });
    await expect(alice.engine.pin(conv, m.id, true)).rejects.toMatchObject({ code: 'unknown' });
    // The unpin first flushes the queued pin, which fails 'unknown' again,
    // so the unpin waits behind it instead of overtaking.
    server.postFailures.push({ code: 'unknown' });
    await expect(alice.engine.pin(conv, m.id, false)).rejects.toMatchObject({ code: 'network' });
    const [pinId, unpinId] = await (async () => {
      const ids = await pendingIds(alice, conv);
      const at = async (id: string) =>
        (await alice.store.get(`pq/${conv}/${id}`))
          ? new TextDecoder().decode((await alice.store.get(`pq/${conv}/${id}`))!)
          : '';
      const withAt = await Promise.all(ids.map(async (id) => ({ id, at: await at(id) })));
      return withAt.sort((a, b) => a.at.localeCompare(b.at)).map((x) => x.id);
    })();
    // A sync where the pin fails 'unknown' once more must not post the unpin.
    server.postFailures.push({ code: 'unknown' });
    await alice.engine.sync(conv);
    expect(server.envelopes.some((e) => e.clientId === unpinId)).toBe(false);
    await alice.engine.sync(conv);
    const order = server.envelopes.map((e) => e.clientId);
    expect(order.indexOf(pinId!)).toBeLessThan(order.indexOf(unpinId!));
    expect(await alice.engine.listPins(conv)).toEqual([]);
    await read(bob, conv);
    expect(await bob.engine.listPins(conv)).toEqual([]);
  });

  it('a queued pin plus a direct unpin keeps X unpinned', async () => {
    const { server, alice, bob, conv } = await pair();
    const m = (await alice.engine.send(conv, { t: 'text', body: 'x' }))!;
    server.failNext.add('postApplication');
    await expect(alice.engine.pin(conv, m.id, true)).rejects.toMatchObject({ code: 'network' });
    await alice.engine.pin(conv, m.id, false); // online again: flushes the pin, then unpins
    expect(await pendingIds(alice, conv)).toEqual([]);
    expect(await alice.engine.listPins(conv)).toEqual([]);
    await read(bob, conv);
    expect(await bob.engine.listPins(conv)).toEqual([]);
  });

  it('init prunes stale records in every chat, even one that never syncs again', async () => {
    const server = new MemoryServer();
    const alice = await device(server);
    const bob = await device(server);
    const quiet = await chat(server, 'direct', alice, [bob]);
    const m = (await alice.engine.send(quiet, { t: 'text', body: 'x' }))!;
    server.failNext.add('postApplication');
    await expect(alice.engine.edit(quiet, m.id, 'secret edit')).rejects.toThrow();
    const [id] = await pendingIds(alice, quiet);
    await setJson(
      alice.store,
      `pq/${quiet}/${id}`,
      new Date(Date.now() - 25 * 3600_000).toISOString(),
    );

    // App restart: a new engine on the same store; the quiet chat is never synced.
    const restarted = new ConnectEngine(server.transport(alice.userId), alice.store, {
      userId: alice.userId,
      platform: 'web',
      label: 'test',
    });
    await restarted.init();
    expect(await alice.store.list(`pp/${quiet}/`)).toEqual([]);
    expect(await alice.store.list(`pq/${quiet}/`)).toEqual([]);
    expect(await alice.store.list(`ob/${quiet}/`)).toEqual([]);
    // Fresh records survive a restart.
    server.failNext.add('postApplication');
    await expect(restarted.edit(quiet, m.id, 'fresh')).rejects.toThrow();
    const again = new ConnectEngine(server.transport(alice.userId), alice.store, {
      userId: alice.userId,
      platform: 'web',
      label: 'test',
    });
    await again.init();
    expect((await alice.store.list(`pp/${quiet}/`)).length).toBe(1);
  });

  it("doesn't re-post an edit that this device's clock already says is too late", async () => {
    const { server, alice, conv } = await pair();
    const m = (await alice.engine.send(conv, { t: 'text', body: 'v1' }))!;
    server.failNext.add('postApplication');
    await expect(alice.engine.edit(conv, m.id, 'v2')).rejects.toThrow();
    const before = server.envelopes.length;
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(Date.now() + 16 * 60_000);
    await alice.engine.sync(conv);
    vi.useRealTimers();
    expect(server.envelopes.length).toBe(before); // no wasted post
    expect(await pendingIds(alice, conv)).toEqual([]);
    expect((await alice.engine.getMessage(conv, m.id))!.body).toBe('v1');
  });
});

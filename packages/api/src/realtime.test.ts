import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { VyboraClient } from './client';
import { announcePresence, joinTypingChannel, watchPresence } from './connect';
import { acquireChannel } from './realtime';

type Handler = (payload: unknown) => void;

/** Mimics realtime-js 2.x: one channel per topic, async leave, no presence `.on` after subscribe. */
class FakeChannel {
  state: 'closed' | 'joined' | 'leaving' = 'closed';
  bindings: { type: string; event: string; cb: Handler }[] = [];
  presence: Record<string, unknown[]> = {};
  sent: unknown[] = [];
  tracked: unknown[] = [];
  untracked = 0;
  subscribeCalls = 0;
  private statusCb: ((s: string) => void) | undefined;
  constructor(
    readonly topic: string,
    readonly params: unknown,
  ) {}
  on(type: string, filter: { event: string }, cb: Handler) {
    if (this.state !== 'closed' && (type === 'presence' || type === 'postgres_changes'))
      throw new Error(`cannot add \`${type}\` callbacks for ${this.topic} after \`subscribe()\`.`);
    this.bindings.push({ type, event: filter.event, cb });
    return this;
  }
  subscribe(cb?: (s: string) => void) {
    this.subscribeCalls++;
    // A leaving channel's subscribe is a no-op, exactly like realtime-js.
    if (this.state === 'closed') {
      this.state = 'joined';
      this.statusCb = cb;
      queueMicrotask(() => this.statusCb?.('SUBSCRIBED'));
    }
    return this;
  }
  presenceState() {
    return this.presence;
  }
  send(msg: unknown) {
    this.sent.push(msg);
    return Promise.resolve('ok');
  }
  track(p: unknown) {
    this.tracked.push(p);
    return Promise.resolve('ok');
  }
  untrack() {
    this.untracked++;
    return Promise.resolve('ok');
  }
  /** Broadcast callbacks receive the message envelope `{ type, event, payload }`. */
  emit(type: string, event: string, payload?: unknown) {
    const msg = type === 'broadcast' ? { type, event, payload } : payload;
    this.bindings.filter((b) => b.type === type && b.event === event).forEach((b) => b.cb(msg));
  }
}

function fakeClient() {
  const channels: FakeChannel[] = [];
  const created: FakeChannel[] = [];
  const leaves: (() => void)[] = [];
  const client = {
    channel: vi.fn((topic: string, params: unknown) => {
      const existing = channels.find((c) => c.topic === topic);
      if (existing) return existing;
      const c = new FakeChannel(topic, params);
      channels.push(c);
      created.push(c);
      return c;
    }),
    removeChannel: vi.fn(
      (c: FakeChannel) =>
        new Promise<string>((resolve) => {
          c.state = 'leaving';
          // The leave is acknowledged later; only then is the topic dropped.
          leaves.push(() => {
            c.state = 'closed';
            channels.splice(channels.indexOf(c), 1);
            resolve('ok');
          });
        }),
    ),
  };
  const ackLeaves = async () => {
    leaves.splice(0).forEach((ack) => ack());
    await flush();
  };
  return { client: client as unknown as VyboraClient, raw: client, channels, created, ackLeaves };
}

const flush = async () => {
  for (let i = 0; i < 5; i++) await Promise.resolve();
};
/** Lets the deferred removal timer fire. */
const tick = async () => {
  await vi.advanceTimersByTimeAsync(1);
  await flush();
};

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe('shared realtime channels', () => {
  it('shares one channel per topic, fans events out and binds once before subscribe', async () => {
    const { client, created } = fakeClient();
    const a = vi.fn();
    const b = vi.fn();
    const one = joinTypingChannel(client, 'c1', 'me', a);
    const two = joinTypingChannel(client, 'c1', 'me', b);
    expect(created).toHaveLength(1);
    const ch = created[0]!;
    expect(ch.subscribeCalls).toBe(1);
    expect(ch.bindings.filter((x) => x.event === 'typing')).toHaveLength(1);

    ch.emit('broadcast', 'typing', { userId: 'u2', typing: true });
    expect(a).toHaveBeenCalledWith('u2', true);
    expect(b).toHaveBeenCalledWith('u2', true);

    // Releasing one holder keeps the other working on the same live channel.
    one.leave();
    await tick();
    expect(ch.state).toBe('joined');
    ch.emit('broadcast', 'typing', { userId: 'u2', typing: false });
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenLastCalledWith('u2', false);
    two.send(true);
    expect(ch.sent).toEqual([
      { type: 'broadcast', event: 'typing', payload: { userId: 'me', typing: true } },
    ]);

    // The last release removes the channel.
    two.leave();
    await tick();
    expect(ch.state).toBe('leaving');
  });

  it('keeps the channel when one holder leaves and another joins in the same commit', async () => {
    const { client, raw, created } = fakeClient();
    const list = joinTypingChannel(client, 'c1', 'me', vi.fn());
    const chat = vi.fn();
    list.leave();
    joinTypingChannel(client, 'c1', 'me', chat);
    await tick();
    expect(raw.removeChannel).not.toHaveBeenCalled();
    created[0]!.emit('broadcast', 'typing', { userId: 'u2', typing: true });
    expect(chat).toHaveBeenCalledWith('u2', true);
  });

  it('joins a fresh channel when re-acquired while the old one is still leaving', async () => {
    const { client, created, ackLeaves } = fakeClient();
    joinTypingChannel(client, 'c1', 'me', vi.fn()).leave();
    await tick();
    const old = created[0]!;
    expect(old.state).toBe('leaving');

    const cb = vi.fn();
    const again = joinTypingChannel(client, 'c1', 'me', cb);
    again.send(true); // dropped while waiting, never sent on the leaving channel
    expect(created).toHaveLength(1);
    expect(old.subscribeCalls).toBe(1);

    await ackLeaves();
    expect(created).toHaveLength(2);
    const fresh = created[1]!;
    expect(fresh).not.toBe(old);
    expect(fresh.state).toBe('joined');
    expect(old.sent).toEqual([]);
    fresh.emit('broadcast', 'typing', { userId: 'u2', typing: true });
    expect(cb).toHaveBeenCalledWith('u2', true);
  });

  it('does not open a channel for a holder that left before the old removal finished', async () => {
    const { client, created, ackLeaves } = fakeClient();
    joinTypingChannel(client, 'c1', 'me', vi.fn()).leave();
    await tick();
    joinTypingChannel(client, 'c1', 'me', vi.fn()).leave();
    await tick();
    await ackLeaves();
    await tick();
    expect(created).toHaveLength(1);
  });

  it('lets two screens watch the same peer without adding presence callbacks after subscribe', async () => {
    const { client, created } = fakeClient();
    const header = vi.fn();
    const list = vi.fn();
    const stopList = watchPresence(client, ['p1', 'p2'], list);
    created[0]!.presence = { p1: [{}] };
    created[0]!.emit('presence', 'sync');
    expect(list).toHaveBeenLastCalledWith(new Set(['p1']));

    // The chat header joins the same peer after the list subscribed: no throw.
    let stopHeader: () => void = () => {};
    expect(() => {
      stopHeader = watchPresence(client, ['p1'], header);
    }).not.toThrow();
    expect(created).toHaveLength(2);
    expect(created[0]!.bindings.filter((b) => b.type === 'presence')).toHaveLength(1);
    // A late watcher gets the current state, as a fresh join would.
    await flush();
    expect(header).toHaveBeenLastCalledWith(new Set(['p1']));

    // The header leaving keeps the list's channel alive.
    stopHeader();
    await tick();
    expect(created[0]!.state).toBe('joined');
    created[0]!.presence = {};
    created[0]!.emit('presence', 'sync');
    expect(list).toHaveBeenLastCalledWith(new Set());
    expect(header).toHaveBeenCalledTimes(1);

    stopList();
    await tick();
    expect(created.every((c) => c.state === 'leaving')).toBe(true);
  });

  it('announces on the own topic with the user as presence key and untracks on stop', async () => {
    const { client, raw, created } = fakeClient();
    const stop = announcePresence(client, 'me');
    expect(raw.channel).toHaveBeenCalledWith('connect:presence:me', {
      config: { private: true, presence: { key: 'me' } },
    });
    await flush();
    expect(created[0]!.tracked).toHaveLength(1);
    stop();
    expect(created[0]!.untracked).toBe(1);
    await tick();
    expect(created[0]!.state).toBe('leaving');
  });

  it('replays the subscribe status to a late holder', async () => {
    const { client } = fakeClient();
    const first = acquireChannel(client, 't', { config: {} });
    await flush();
    const status = vi.fn();
    const second = acquireChannel(client, 't', { config: {} });
    second.onStatus(status);
    await flush();
    expect(status).toHaveBeenCalledWith('SUBSCRIBED');
    first.release();
    second.release();
    second.release(); // idempotent
    await tick();
  });
});

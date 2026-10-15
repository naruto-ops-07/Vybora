import type { RealtimeChannel } from '@supabase/supabase-js';
import type { VyboraClient } from './client';

/**
 * Reference-counted Realtime channels, shared per (client, topic).
 *
 * realtime-js keeps one channel object per topic: `client.channel(topic)`
 * returns the existing one, presence/postgres callbacks cannot be added after
 * `subscribe()`, and `removeChannel()` leaves asynchronously (the channel stays
 * registered under its topic until the server acknowledges the leave). Two
 * screens that independently join the same topic (the chat list and the open
 * chat, for example) would therefore share one channel and tear it down for
 * each other.
 *
 * This registry owns the underlying channel: callbacks are bound exactly once,
 * before `subscribe()`, and fanned out to every holder; the channel is removed
 * only when the last holder releases it (deferred by one task so a release and
 * re-acquire in the same render commit keeps the live channel); and an acquire
 * while a removal is still in flight waits for it to finish and then joins a
 * fresh channel instead of reusing the one that is leaving.
 *
 * Constraint: the first acquirer's spec (config, presence) defines the channel.
 * Every topic in this package is acquired with one fixed spec (see the
 * `*Spec` helpers in connect.ts), so holders never disagree.
 */

type ChannelConfig = NonNullable<NonNullable<Parameters<VyboraClient['channel']>[1]>['config']>;
type PresenceState = Record<string, unknown[]>;

export interface ChannelSpec {
  config: ChannelConfig;
  /** Broadcast events bound before subscribe (others are bound on first use). */
  broadcast?: readonly string[];
  /** Bind presence sync (must be decided when the channel is created). */
  presence?: boolean;
}

export interface SharedChannel {
  onBroadcast(event: string, cb: (payload: unknown) => void): () => void;
  /** Called on every presence sync; a late holder gets the current state once. */
  onPresenceSync(cb: (state: PresenceState) => void): () => void;
  /** Subscribe status changes; a late holder gets the last status once. */
  onStatus(cb: (status: string) => void): () => void;
  send(event: string, payload: unknown): void;
  track(payload: Record<string, unknown>): void;
  untrack(): void;
  /** Idempotent. The channel is removed when the last holder releases it. */
  release(): void;
}

interface Entry {
  topic: string;
  spec: ChannelSpec;
  channel: RealtimeChannel | null;
  refs: number;
  bound: Set<string>;
  broadcast: Map<string, Set<(payload: unknown) => void>>;
  presence: Set<(state: PresenceState) => void>;
  status: Set<(status: string) => void>;
  lastStatus: string | null;
  synced: boolean;
  removeTimer: ReturnType<typeof setTimeout> | null;
}

interface Registry {
  entries: Map<string, Entry>;
  removals: Map<string, Promise<void>>;
}

const registries = new WeakMap<object, Registry>();
const noop = () => {};

function registryFor(client: VyboraClient): Registry {
  let reg = registries.get(client);
  if (!reg) {
    reg = { entries: new Map(), removals: new Map() };
    registries.set(client, reg);
  }
  return reg;
}

function bindBroadcast(entry: Entry, channel: RealtimeChannel, event: string) {
  channel.on('broadcast', { event }, (msg: { payload?: unknown }) => {
    entry.broadcast.get(event)?.forEach((cb) => cb(msg.payload));
  });
}

function open(client: VyboraClient, entry: Entry) {
  const channel = client.channel(entry.topic, { config: entry.spec.config });
  entry.channel = channel;
  for (const event of entry.bound) bindBroadcast(entry, channel, event);
  if (entry.spec.presence) {
    channel.on('presence', { event: 'sync' }, () => {
      entry.synced = true;
      const state = channel.presenceState() as PresenceState;
      entry.presence.forEach((cb) => cb(state));
    });
  }
  channel.subscribe((status) => {
    entry.lastStatus = status;
    entry.status.forEach((cb) => cb(status));
  });
}

function scheduleRemoval(client: VyboraClient, reg: Registry, entry: Entry) {
  entry.removeTimer = setTimeout(() => {
    entry.removeTimer = null;
    if (entry.refs > 0 || reg.entries.get(entry.topic) !== entry) return;
    reg.entries.delete(entry.topic);
    const channel = entry.channel;
    entry.channel = null;
    if (!channel) return;
    let leaving: Promise<unknown>;
    try {
      leaving = client.removeChannel(channel);
    } catch {
      leaving = Promise.resolve();
    }
    const done: Promise<void> = Promise.resolve(leaving)
      .then(noop, noop)
      .then(() => {
        if (reg.removals.get(entry.topic) === done) reg.removals.delete(entry.topic);
      });
    reg.removals.set(entry.topic, done);
  }, 0);
}

export function acquireChannel(
  client: VyboraClient,
  topic: string,
  spec: ChannelSpec,
): SharedChannel {
  const reg = registryFor(client);
  let entry = reg.entries.get(topic);
  if (entry) {
    if (entry.removeTimer) clearTimeout(entry.removeTimer);
    entry.removeTimer = null;
  } else {
    const created: Entry = {
      topic,
      spec,
      channel: null,
      refs: 0,
      bound: new Set(spec.broadcast ?? []),
      broadcast: new Map(),
      presence: new Set(),
      status: new Set(),
      lastStatus: null,
      synced: false,
      removeTimer: null,
    };
    entry = created;
    reg.entries.set(topic, created);
    const pending = reg.removals.get(topic);
    if (pending)
      void pending.then(() => {
        if (reg.entries.get(topic) === created && created.refs > 0 && !created.channel)
          open(client, created);
      });
    else open(client, created);
  }
  const e = entry;
  e.refs++;

  const offs = new Set<() => void>();
  let released = false;
  const listen = <T>(set: Set<T>, cb: T) => {
    if (released) return noop;
    set.add(cb);
    const off = () => {
      set.delete(cb);
      offs.delete(off);
    };
    offs.add(off);
    return off;
  };
  // Replay current state to a late holder asynchronously, as a fresh join would.
  const replay = (set: Set<unknown>, cb: unknown, fire: () => void) =>
    queueMicrotask(() => {
      if (set.has(cb)) fire();
    });

  return {
    onBroadcast(event, cb) {
      let set = e.broadcast.get(event);
      if (!set) e.broadcast.set(event, (set = new Set()));
      if (!e.bound.has(event)) {
        e.bound.add(event);
        // Broadcast bindings may be added after subscribe(); presence may not.
        if (e.channel) bindBroadcast(e, e.channel, event);
      }
      return listen(set, cb);
    },
    onPresenceSync(cb) {
      const off = listen(e.presence, cb);
      if (e.synced && e.channel) {
        const ch = e.channel;
        replay(e.presence, cb, () => cb(ch.presenceState() as PresenceState));
      }
      return off;
    },
    onStatus(cb) {
      const off = listen(e.status, cb);
      const last = e.lastStatus;
      if (last) replay(e.status, cb, () => cb(last));
      return off;
    },
    send(event, payload) {
      if (released || !e.channel) return;
      void Promise.resolve(e.channel.send({ type: 'broadcast', event, payload })).catch(noop);
    },
    track(payload) {
      if (released || !e.channel) return;
      void Promise.resolve(e.channel.track(payload)).catch(noop);
    },
    untrack() {
      if (released || !e.channel) return;
      void Promise.resolve(e.channel.untrack()).catch(noop);
    },
    release() {
      if (released) return;
      released = true;
      [...offs].forEach((off) => off());
      e.refs--;
      if (e.refs === 0) scheduleRemoval(client, reg, e);
    },
  };
}

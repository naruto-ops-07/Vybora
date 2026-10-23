import {
  decodeMlsMessage,
  encodeMlsMessage,
  type ClientConfig,
  type ClientState,
  type KeyPackage,
} from 'ts-mls';
import { decodeKeyPackage, encodeKeyPackage } from 'ts-mls/keyPackage.js';
import { decryptAttachment, encryptAttachment } from './attachments';
import { b64, randomId } from './codec';
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
} from './group';
import {
  deserializeIdentity,
  generateIdentityKeys,
  generateKeyPackages,
  safetyNumber,
  serializeIdentity,
  type DeviceIdentity,
  type GeneratedKeyPackage,
  type StoredIdentity,
} from './identity';
import {
  UUID_RE,
  openPayload,
  sealPayload,
  type AttachmentRef,
  type OpenedPayload,
  type Payload,
} from './payload';
import { getJson, setJson, type KeyValueStore } from './store';
import {
  ConnectError,
  isTransient,
  toConnectError,
  type ConnectTransport,
  type ConversationInfo,
  type EnvelopeRecord,
  type OwnDeviceRecord,
} from './transport';
import {
  applyPin,
  mayPin,
  normalizeVote,
  validMentions,
  withinEditWindow,
  type PinEntry,
} from './rules';

export type MessageStatus = 'sending' | 'sent' | 'failed' | 'received' | 'undecryptable';

export interface ReplyRef {
  id: string;
  senderId: string;
  preview: string;
}

/** A decrypted message as stored on this device (never sent anywhere). */
export interface LocalMessage {
  id: string;
  conversationId: string;
  seq: number | null;
  senderId: string;
  senderDeviceId: string | null;
  createdAt: string;
  expiresAt: string | null;
  status: MessageStatus;
  /** 'unsupported': a newer kind this build can't show ("Update VYBORA to see this message"). */
  kind: 'text' | 'attachment' | 'contact' | 'location' | 'poll' | 'undecryptable' | 'unsupported';
  body?: string;
  attachment?: AttachmentRef;
  caption?: string;
  replyTo?: ReplyRef;
  reactions: Record<string, string[]>;
  deleted?: boolean;
  /** Validated mentioned member ids (`@[userId]` tokens in `body`). */
  mentions?: string[];
  forwarded?: boolean;
  /** Body/caption was replaced by the sender (history is not kept). */
  edited?: boolean;
  editedAt?: string;
  contact?: ContactCard;
  location?: LocationPin;
  poll?: LocalPoll;
  /**
   * View-once attachment. Its key and blob path are never on the message: they
   * live under a separate store key that only `consumeViewOnce` reads (and then
   * deletes). `consumed` is true once opened, and always on the sender's devices.
   */
  viewOnce?: { kind: AttachmentRef['kind']; consumed: boolean };
  /** Starred on this device only (never synced). */
  starred?: boolean;
}

export interface ContactCard {
  userId: string;
  username: string;
  displayName: string;
}

export interface LocationPin {
  lat: number;
  lng: number;
  label?: string;
}

export interface LocalPoll {
  question: string;
  options: string[];
  multi: boolean;
  /** Each voter's current choice indexes (latest vote wins; absent = not voted). */
  votes: Record<string, number[]>;
}

export type OutgoingContent =
  | { t: 'text'; body: string; replyTo?: ReplyRef; mentions?: string[]; forwarded?: true }
  | {
      t: 'attachment';
      attachment: AttachmentRef;
      caption?: string;
      replyTo?: ReplyRef;
      forwarded?: true;
    }
  | { t: 'reaction'; target: string; emoji: string; remove?: boolean }
  | { t: 'delete'; target: string }
  | { t: 'edit'; target: string; body: string; mentions?: string[] }
  | { t: 'pin'; target: string; pinned: boolean }
  | { t: 'contact'; userId: string; username: string; displayName: string; forwarded?: true }
  | { t: 'location'; lat: number; lng: number; label?: string; forwarded?: true }
  | { t: 'poll'; question: string; options: string[]; multi: boolean }
  | { t: 'vote'; target: string; choices: number[] };

type ContentPayload = Extract<
  Payload,
  { t: 'text' | 'attachment' | 'contact' | 'location' | 'poll' }
>;
const CONTENT_KINDS = new Set(['text', 'attachment', 'contact', 'location', 'poll']);
const isContent = (p: Payload): p is ContentPayload => CONTENT_KINDS.has(p.t);
/** Controls the sender's device refuses up front (and reports if server time refuses them). */
const CHECKED = new Set(['edit', 'pin', 'vote']);
/**
 * Delivery failures after which a control may still have been stored (e.g. a
 * 502 after the insert committed). Its records are kept and the control is
 * QUEUED: every later sync of the chat re-delivers it (or recognises the
 * stored copy). Contract for callers: a control (edit/pin/vote/reaction/
 * delete) rejecting with code 'network' or 'unknown' means "queued, will
 * retry". Any other code means it was not stored and has been dropped.
 */
const QUEUED_CODES = new Set(['network', 'unknown']);
/** Queued controls older than this are dropped unsent (no plaintext lingers). */
const QUEUE_TTL_MS = 24 * 60 * 60 * 1000;

export type SyncStatus = 'ready' | 'waiting_for_access' | 'broken';

export interface ContactKeyStatus {
  status: 'new' | 'unchanged' | 'changed';
  verified: boolean;
  keys: string[];
}

interface PendingOutbound {
  id: string;
  epoch: number;
  ciphertext: string;
  attachmentPaths: string[];
}

interface StoredKeyPackage {
  pub: string;
  init: string;
  hpke: string;
  sig: string;
}

const KEY_PACKAGE_TARGET = 20;
const KEY_PACKAGE_MIN = 8;
const FETCH_PAGE = 100;
const pad = (n: number) => n.toString().padStart(16, '0');

/**
 * Per-device messaging engine. Owns identity, key packages, MLS group state
 * and the local decrypted history; talks to the server only through a
 * ConnectTransport. All mutations of a conversation are serialized.
 *
 * What the engine trusts the server for (it can't verify these):
 *  - `createdAt` of envelopes: the edit window is measured between the
 *    original's and the edit's server timestamps, so a dishonest server could
 *    stretch or shrink it (it cannot forge or alter content).
 *  - `seq` order: "latest wins" for votes, edits and pins follows server order.
 *  - roster, admin role and `settings_policy` (from getConversation): decide
 *    who may pin in admins-only groups and which mentions are members. These
 *    are read at sync time, so a pin is judged by the current policy.
 * Everything else (who sent what, content, targets) is checked end to end via
 * MLS and the inner Ed25519 signature.
 */
export class ConnectEngine {
  private identity: DeviceIdentity | null = null;
  private readonly directoryCache = new Map<string, DirectoryDevice>();
  private readonly locks = new Map<string, Promise<unknown>>();
  private readonly config: ClientConfig;
  private listeners = new Set<(conversationId: string) => void>();
  private readonly infoCache = new Map<string, ConversationInfo>();
  /**
   * Bumped whenever a directory lookup fails transiently. MLS may wrap the
   * error it gets from our lookup, so processing compares this counter
   * instead of relying on the error type alone.
   */
  private transientLookups = 0;
  private lastQueuedMs = 0;

  constructor(
    private readonly transport: ConnectTransport,
    private readonly store: KeyValueStore,
    private readonly options: {
      userId: string;
      platform: 'ios' | 'android' | 'web';
      label: string;
    },
  ) {
    this.config = makeClientConfig({ lookup: (id) => this.lookupDevice(id) });
  }

  // ------------------------------------------------------------------
  // Lifecycle
  // ------------------------------------------------------------------

  get deviceId(): string {
    if (!this.identity) throw new ConnectError('not_ready', 'Engine not initialized');
    return this.identity.deviceId;
  }

  get userId(): string {
    return this.options.userId;
  }

  /** Load or create this device's identity, then keep key packages topped up. */
  async init(): Promise<{ deviceId: string; created: boolean }> {
    const stored = await getJson<StoredIdentity>(this.store, 'identity');
    if (stored && stored.userId === this.options.userId) {
      const server = await this.transport.getDevice(stored.deviceId);
      if (server && !server.revoked && server.identityKey === stored.publicKey) {
        this.identity = deserializeIdentity(stored);
        await this.pruneQueued(); // no control plaintext outlives 24 h, synced or not
        await this.transport.touchDevice(stored.deviceId).catch(() => undefined);
        await this.topUpKeyPackages();
        return { deviceId: stored.deviceId, created: false };
      }
      // Revoked elsewhere or account switched: wipe everything local.
      await this.store.clear();
    } else if (stored) {
      await this.store.clear();
    }
    const keys = await generateIdentityKeys();
    const deviceId = await this.transport.registerDevice({
      identityKey: b64.encode(keys.publicKey),
      platform: this.options.platform,
      label: this.options.label,
    });
    this.identity = { userId: this.options.userId, deviceId, ...keys };
    await setJson(this.store, 'identity', serializeIdentity(this.identity));
    await this.topUpKeyPackages();
    return { deviceId, created: true };
  }

  /** Revoke this device on the server and erase all local keys and history. */
  async signOutAndWipe(): Promise<void> {
    if (this.identity)
      await this.transport.revokeDevice(this.identity.deviceId).catch(() => undefined);
    await this.store.clear();
    this.identity = null;
  }

  onChange(listener: (conversationId: string) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(conversationId: string) {
    for (const l of this.listeners) l(conversationId);
  }

  async topUpKeyPackages(): Promise<number> {
    const identity = this.requireIdentity();
    const available = await this.transport.countUnclaimedKeyPackages(identity.deviceId);
    if (available >= KEY_PACKAGE_MIN) return 0;
    const generated = await generateKeyPackages(identity, KEY_PACKAGE_TARGET - available);
    for (const kp of generated) await this.saveKeyPackage(kp);
    await this.transport.publishKeyPackages(
      identity.deviceId,
      generated.map((kp) =>
        b64.encode(
          encodeMlsMessage({
            keyPackage: kp.publicPackage,
            wireformat: 'mls_key_package',
            version: 'mls10',
          }),
        ),
      ),
    );
    return generated.length;
  }

  // ------------------------------------------------------------------
  // Messaging
  // ------------------------------------------------------------------

  /** Pull and process everything new for a conversation; keep membership in sync. */
  sync(conversationId: string): Promise<{ status: SyncStatus; epoch: number | null }> {
    return this.locked(conversationId, async () => {
      const result = await this.syncLocked(conversationId);
      // Server envelopes are processed first, so any stored copy of a queued
      // control has already been recognised (and its records removed).
      if (result.status === 'ready') await this.redeliverQueued(conversationId);
      return result;
    });
  }

  /**
   * Re-deliver this chat's queued controls (see QUEUED_CODES). Content
   * messages are not auto-resent: they keep the explicit Retry flow.
   * Refused re-deliveries are dropped quietly; transient ones stay queued;
   * records older than 24 h (or without a queue time) are dropped unsent.
   */
  private async redeliverQueued(conversationId: string): Promise<number> {
    let changed = false;
    const queue: { id: string; age: number; at: string; payload: Payload }[] = [];
    for (const key of await this.store.list(`pp/${conversationId}/`)) {
      const id = key.slice(key.lastIndexOf('/') + 1);
      const payload = await getJson<Payload>(this.store, key);
      if (!payload || isContent(payload)) continue;
      const at = (await getJson<string>(this.store, `pq/${conversationId}/${id}`)) ?? '';
      queue.push({ id, at, payload, age: at ? Date.now() - Date.parse(at) : Infinity });
    }
    queue.sort((a, b) => a.at.localeCompare(b.at)); // keep send order (pin, then unpin)
    let remaining = queue.length;
    for (const { id, age, payload } of queue) {
      if (!(age <= QUEUE_TTL_MS)) {
        await this.dropPending(conversationId, id);
        remaining--;
        changed = true;
        continue;
      }
      // Already invalid by this device's clock (e.g. edit window passed): don't post.
      if (
        CHECKED.has(payload.t) &&
        !(await this.applyControl(
          conversationId,
          payload,
          this.userId,
          new Date().toISOString(),
          await this.cachedInfo(conversationId),
          true,
        ))
      ) {
        await this.dropPending(conversationId, id);
        remaining--;
        changed = true;
        continue;
      }
      try {
        await this.deliverLocked(conversationId, id, undefined);
        remaining--;
        changed = true;
      } catch (error) {
        // Still offline, or maybe stored ('unknown'): stop here so nothing
        // later (e.g. an unpin) is posted before this one (the pin).
        if (QUEUED_CODES.has(toConnectError(error).code)) break;
        await this.dropPending(conversationId, id); // refused (e.g. too late to edit)
        remaining--;
        changed = true;
      }
    }
    if (changed) this.emit(conversationId);
    return remaining;
  }

  /** Drop queued controls older than 24 h (or without a queue time) in every chat. */
  private async pruneQueued(): Promise<void> {
    for (const key of await this.store.list('pp/')) {
      const [, conv, id] = key.split('/');
      if (!conv || !id) continue;
      const payload = await getJson<Payload>(this.store, key);
      if (!payload || isContent(payload)) continue;
      const at = await getJson<string>(this.store, `pq/${conv}/${id}`);
      if (!(at && Date.now() - Date.parse(at) <= QUEUE_TTL_MS)) await this.dropPending(conv, id);
    }
  }

  /** Send content. Resolves once the server has durably stored the ciphertext. */
  send(
    conversationId: string,
    content: OutgoingContent,
    attachmentPaths: string[] = [],
  ): Promise<LocalMessage | null> {
    return this.locked(conversationId, async () => {
      const id = randomId();
      let payload = { v: 1, id, ...content } as Payload;
      // Controls go out in order: flush this chat's queued ones first.
      const behind = isContent(payload) ? 0 : await this.redeliverQueued(conversationId);
      const now = new Date().toISOString();
      const needsInfo =
        CHECKED.has(payload.t) ||
        ((payload.t === 'text' || payload.t === 'edit') && !!payload.mentions?.length);
      const info = needsInfo ? await this.getInfo(conversationId) : null;
      if ((payload.t === 'text' || payload.t === 'edit') && payload.mentions?.length) {
        const mentions = validMentions(payload.body, payload.mentions, info!.memberIds);
        if (mentions?.length !== new Set(payload.mentions.map((m) => m.toLowerCase())).size)
          throw new ConnectError('forbidden', 'invalid_mentions');
        payload = { ...payload, mentions };
      }
      if (isContent(payload)) {
        const local: LocalMessage = {
          id,
          conversationId,
          seq: null,
          senderId: this.userId,
          senderDeviceId: this.deviceId,
          createdAt: now,
          expiresAt: null,
          status: 'sending',
          ...this.contentFields(payload, true),
        };
        await this.saveMessage(local);
        this.emit(conversationId);
      } else if (CHECKED.has(payload.t)) {
        // Edit/pin/vote: check now like a receiver would (device clock, UX only).
        const ok = await this.applyControl(conversationId, payload, this.userId, now, info!, true);
        if (!ok) throw new ConnectError('forbidden', `${payload.t}_not_allowed`);
      }
      // Every control (edit/pin/vote/reaction/delete) changes nothing locally
      // until the server has stored it; it is then applied with the server's
      // createdAt, exactly as every receiver will. So a control is never shown
      // as done while it was never sent.
      await setJson(this.store, `pp/${conversationId}/${id}`, payload);
      if (!isContent(payload)) {
        // Strictly increasing, so re-delivery keeps send order even within a millisecond.
        this.lastQueuedMs = Math.max(Date.now(), this.lastQueuedMs + 1);
        await setJson(
          this.store,
          `pq/${conversationId}/${id}`,
          new Date(this.lastQueuedMs).toISOString(),
        );
        // Older controls are still queued: wait behind them (contract: 'network' = queued).
        if (behind > 0)
          throw new ConnectError('network', 'queued behind earlier controls; will retry');
      }
      return this.deliverLocked(conversationId, id, attachmentPaths);
    });
  }

  /** Retry a failed outgoing message (same idempotency key; re-encrypted only if needed). */
  retry(conversationId: string, messageId: string): Promise<LocalMessage | null> {
    return this.locked(conversationId, () =>
      this.deliverLocked(conversationId, messageId, undefined),
    );
  }

  async listMessages(
    conversationId: string,
    options: { limit?: number; beforeSeq?: number } = {},
  ): Promise<LocalMessage[]> {
    const now = Date.now();
    const keys = await this.store.list(`ord/${conversationId}/`);
    const limit = options.limit ?? 50;
    const filtered = options.beforeSeq
      ? keys.filter((k) => k < `ord/${conversationId}/${pad(options.beforeSeq!)}`)
      : keys;
    const page = filtered.slice(-limit);
    const out: LocalMessage[] = [];
    for (const k of page) {
      const id = await getJson<string>(this.store, k);
      const m = id ? await getJson<LocalMessage>(this.store, `msg/${conversationId}/${id}`) : null;
      if (!m) continue;
      if (m.expiresAt && Date.parse(m.expiresAt) <= now) {
        await this.deleteLocalMessage(m, k);
        continue;
      }
      out.push(m);
    }
    if (!options.beforeSeq) {
      for (const k of await this.store.list(`out/${conversationId}/`)) {
        const m = await getJson<LocalMessage>(
          this.store,
          `msg/${conversationId}/${k.split('/').pop()}`,
        );
        if (m) out.push(m);
      }
    }
    return out;
  }

  /** Edit my own text (body) or attachment (caption) within the edit window. */
  edit(conversationId: string, target: string, body: string, mentions?: string[]) {
    return this.send(conversationId, { t: 'edit', target, body, mentions });
  }

  /** Pin or unpin a message for everyone in the chat (max 3; oldest drops). */
  pin(conversationId: string, target: string, pinned: boolean) {
    return this.send(conversationId, { t: 'pin', target, pinned });
  }

  /** Cast (or with `[]`, withdraw) my vote; replaces any earlier vote of mine. */
  vote(conversationId: string, pollId: string, choices: number[]) {
    return this.send(conversationId, { t: 'vote', target: pollId, choices });
  }

  /** Current pins, oldest first. */
  async listPins(conversationId: string): Promise<PinEntry[]> {
    const pins = (await getJson<PinEntry[]>(this.store, `pins/${conversationId}`)) ?? [];
    const live: PinEntry[] = [];
    for (const p of pins) {
      const m = await this.getMessage(conversationId, p.messageId);
      if (m && !m.deleted && !(m.expiresAt && Date.parse(m.expiresAt) <= Date.now())) live.push(p);
    }
    if (live.length !== pins.length) await setJson(this.store, `pins/${conversationId}`, live);
    return live;
  }

  /**
   * Forward a message into another chat. Content is re-sent (never the
   * original ciphertext); attachments are downloaded, decrypted and
   * re-encrypted + re-uploaded under the target chat. Mention tokens become
   * plain `@Name` text. Polls, view-once and deleted messages can't be forwarded.
   */
  async forward(
    fromConversationId: string,
    messageId: string,
    toConversationId: string,
    options: { nameOf?: (userId: string) => string } = {},
  ): Promise<LocalMessage | null> {
    const m = await this.getMessage(fromConversationId, messageId);
    if (!m || m.deleted || m.viewOnce || m.status === 'sending' || m.status === 'failed')
      throw new ConnectError('forbidden', 'not_forwardable');
    if (m.kind === 'text' && m.body) {
      const valid = new Set(m.mentions ?? []);
      const body = m.body.replace(/@\[([0-9a-f-]{36})\]/gi, (token, id: string) =>
        valid.has(id.toLowerCase()) ? `@${options.nameOf?.(id.toLowerCase()) ?? 'someone'}` : token,
      );
      return this.send(toConversationId, { t: 'text', body, forwarded: true });
    }
    if (m.kind === 'attachment' && m.attachment) {
      const bytes = await this.openAttachment(m.attachment);
      const {
        path: _p,
        key: _k,
        nonce: _n,
        sha256: _s,
        size: _z,
        viewOnce: _v,
        ...meta
      } = m.attachment;
      return this.sendAttachment(toConversationId, bytes, meta, {
        caption: m.caption,
        forwarded: true,
      });
    }
    if (m.kind === 'contact' && m.contact)
      return this.send(toConversationId, { t: 'contact', ...m.contact, forwarded: true });
    if (m.kind === 'location' && m.location)
      return this.send(toConversationId, { t: 'location', ...m.location, forwarded: true });
    throw new ConnectError('forbidden', 'not_forwardable');
  }

  /**
   * Open a received view-once attachment exactly once: returns the plaintext
   * and forgets the key and blob reference on this device. Null if already
   * opened (or not a view-once message).
   */
  consumeViewOnce(conversationId: string, messageId: string): Promise<Uint8Array | null> {
    return this.locked(conversationId, async () => {
      const m = await this.getMessage(conversationId, messageId);
      const voKey = `vo/${conversationId}/${messageId}`;
      const ref = await getJson<AttachmentRef>(this.store, voKey);
      if (!m?.viewOnce || m.viewOnce.consumed || !ref) {
        await this.store.delete(voKey);
        return null;
      }
      const bytes = await this.openAttachment(ref);
      await setJson(this.store, `msg/${conversationId}/${m.id}`, {
        ...m,
        viewOnce: { ...m.viewOnce, consumed: true },
      } satisfies LocalMessage);
      await this.store.delete(voKey);
      this.emit(conversationId);
      return bytes;
    });
  }

  /** Star or unstar a message on this device only. */
  async star(conversationId: string, messageId: string, starred: boolean): Promise<void> {
    await this.locked(conversationId, async () => {
      const m = await this.getMessage(conversationId, messageId);
      if (!m) return;
      await setJson(this.store, `msg/${conversationId}/${m.id}`, {
        ...m,
        starred: starred || undefined,
      } satisfies LocalMessage);
      if (starred)
        await setJson(this.store, `star/${conversationId}/${m.id}`, new Date().toISOString());
      else await this.store.delete(`star/${conversationId}/${m.id}`);
    });
    this.emit(conversationId);
  }

  /** Starred messages (all chats, or one), most recently starred first. */
  async listStarred(conversationId?: string): Promise<LocalMessage[]> {
    const rows: { at: string; m: LocalMessage }[] = [];
    for (const k of await this.store.list(conversationId ? `star/${conversationId}/` : 'star/')) {
      const [, conv, id] = k.split('/');
      const m = await this.getMessage(conv!, id!);
      const at = await getJson<string>(this.store, k);
      if (m && at) rows.push({ at, m });
      else await this.store.delete(k);
    }
    return rows.sort((a, b) => b.at.localeCompare(a.at)).map((r) => r.m);
  }

  /**
   * Local history for search and other views (one chat or all), newest
   * first, expired messages excluded. Matching is done by @vybora/core's
   * `searchMessages(messages, query)` so there is a single implementation.
   */
  async queryMessages(
    options: {
      conversationId?: string;
      filter?: (m: LocalMessage) => boolean;
      limit?: number;
    } = {},
  ): Promise<LocalMessage[]> {
    const now = Date.now();
    const out: LocalMessage[] = [];
    const prefix = options.conversationId ? `msg/${options.conversationId}/` : 'msg/';
    for (const k of await this.store.list(prefix)) {
      const m = await getJson<LocalMessage>(this.store, k);
      if (!m || (m.expiresAt && Date.parse(m.expiresAt) <= now)) continue;
      if (!options.filter || options.filter(m)) out.push(m);
    }
    out.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return options.limit ? out.slice(0, options.limit) : out;
  }

  async getMessage(conversationId: string, id: string): Promise<LocalMessage | null> {
    return getJson<LocalMessage>(this.store, `msg/${conversationId}/${id}`);
  }

  /** Delete local copies (e.g. "clear chat"); the server only ever had ciphertext. */
  async clearConversation(conversationId: string): Promise<void> {
    for (const prefix of [
      `msg/${conversationId}/`,
      `ord/${conversationId}/`,
      `out/${conversationId}/`,
      `pp/${conversationId}/`,
      `pq/${conversationId}/`,
      `star/${conversationId}/`,
      `vo/${conversationId}/`,
    ]) {
      for (const k of await this.store.list(prefix)) await this.store.delete(k);
    }
    await this.store.delete(`pins/${conversationId}`);
    this.emit(conversationId);
  }

  // ------------------------------------------------------------------
  // Attachments
  // ------------------------------------------------------------------

  /** Encrypt, upload (ciphertext only) and send an attachment message. */
  async sendAttachment(
    conversationId: string,
    file: Uint8Array,
    meta: Omit<AttachmentRef, 'path' | 'key' | 'nonce' | 'sha256' | 'size'>,
    extra: { caption?: string; replyTo?: ReplyRef; forwarded?: true } = {},
  ): Promise<LocalMessage | null> {
    const enc = encryptAttachment(file);
    const path = `${conversationId}/${this.userId}/${randomId()}.bin`;
    await this.transport.uploadAttachment(path, enc.ciphertext);
    const attachment: AttachmentRef = {
      ...meta,
      path,
      key: enc.key,
      nonce: enc.nonce,
      sha256: enc.sha256,
      size: file.length,
    };
    return this.send(conversationId, { t: 'attachment', attachment, ...extra }, [path]);
  }

  async openAttachment(ref: AttachmentRef): Promise<Uint8Array> {
    return decryptAttachment(await this.transport.downloadAttachment(ref.path), ref);
  }

  // ------------------------------------------------------------------
  // Identity verification
  // ------------------------------------------------------------------

  /** Trust-on-first-use pinning of a contact's device keys, with change detection. */
  async checkContactKeys(userId: string): Promise<ContactKeyStatus> {
    const keys = (await this.transport.listDevices([userId]))
      .filter((d) => !d.revoked)
      .map((d) => d.identityKey)
      .sort();
    const pin = await getJson<{ keys: string[]; verified: boolean }>(this.store, `pin/${userId}`);
    if (!pin) {
      await setJson(this.store, `pin/${userId}`, { keys, verified: false });
      return { status: 'new', verified: false, keys };
    }
    const same = pin.keys.length === keys.length && pin.keys.every((k, i) => k === keys[i]);
    return { status: same ? 'unchanged' : 'changed', verified: same && pin.verified, keys };
  }

  /** Accept the current keys (after a change) and optionally mark them verified. */
  async trustContactKeys(userId: string, verified: boolean): Promise<void> {
    const keys = (await this.transport.listDevices([userId]))
      .filter((d) => !d.revoked)
      .map((d) => d.identityKey)
      .sort();
    await setJson(this.store, `pin/${userId}`, { keys, verified });
  }

  async safetyNumberWith(userId: string): Promise<string> {
    const devices = await this.transport.listDevices([this.userId, userId]);
    const keysOf = (u: string) =>
      devices.filter((d) => d.userId === u && !d.revoked).map((d) => d.identityKey);
    return safetyNumber(
      { userId: this.userId, keys: keysOf(this.userId) },
      { userId, keys: keysOf(userId) },
    );
  }

  async listMyDevices(): Promise<OwnDeviceRecord[]> {
    return this.transport.listOwnDevices();
  }

  async revokeDevice(deviceId: string): Promise<void> {
    if (deviceId === this.identity?.deviceId) return this.signOutAndWipe();
    await this.transport.revokeDevice(deviceId);
  }

  // ------------------------------------------------------------------
  // Internals
  // ------------------------------------------------------------------

  private requireIdentity(): DeviceIdentity {
    if (!this.identity) throw new ConnectError('not_ready', 'Engine not initialized');
    return this.identity;
  }

  private async locked<T>(key: string, fn: () => Promise<T>): Promise<T> {
    const prev = this.locks.get(key) ?? Promise.resolve();
    const run = prev.catch(() => undefined).then(fn);
    this.locks.set(
      key,
      run.catch(() => undefined),
    );
    return run;
  }

  /** Roster/roles as of the last sync (fetched if never loaded). Never call inside envelope processing. */
  private async cachedInfo(conversationId: string): Promise<ConversationInfo> {
    return this.infoCache.get(conversationId) ?? this.getInfo(conversationId);
  }

  private async getInfo(conversationId: string): Promise<ConversationInfo> {
    const info = await this.transport.getConversation(conversationId);
    this.infoCache.set(conversationId, info);
    return info;
  }

  private async lookupDevice(deviceId: string): Promise<DirectoryDevice | null> {
    if (!UUID_RE.test(deviceId)) return null; // never send crafted ids to the server
    const cached = this.directoryCache.get(deviceId);
    if (cached) return cached;
    let d;
    try {
      d = await this.transport.getDevice(deviceId);
    } catch (error) {
      if (isTransient(error)) this.transientLookups++;
      throw error;
    }
    if (!d) return null;
    const entry: DirectoryDevice = {
      deviceId: d.id,
      userId: d.userId,
      identityKey: d.identityKey,
      revoked: d.revoked,
    };
    this.directoryCache.set(deviceId, entry);
    return entry;
  }

  private async saveKeyPackage(kp: GeneratedKeyPackage) {
    const record: StoredKeyPackage = {
      pub: b64.encode(encodeKeyPackage(kp.publicPackage)),
      init: b64.encode(kp.privatePackage.initPrivateKey),
      hpke: b64.encode(kp.privatePackage.hpkePrivateKey),
      sig: b64.encode(kp.privatePackage.signaturePrivateKey),
    };
    await setJson(this.store, `kp/${kp.ref}`, record);
  }

  private async loadKeyPackage(ref: string): Promise<GeneratedKeyPackage | null> {
    const r = await getJson<StoredKeyPackage>(this.store, `kp/${ref}`);
    if (!r) return null;
    const decoded = decodeKeyPackage(b64.decode(r.pub), 0);
    if (!decoded) return null;
    return {
      ref,
      publicPackage: decoded[0],
      privatePackage: {
        initPrivateKey: b64.decode(r.init),
        hpkePrivateKey: b64.decode(r.hpke),
        signaturePrivateKey: b64.decode(r.sig),
      },
    };
  }

  private async loadState(conversationId: string): Promise<ClientState | null> {
    const bytes = await this.store.get(`g/${conversationId}`);
    return bytes ? decodeState(bytes, this.config) : null;
  }

  private async saveState(conversationId: string, state: ClientState, cursor?: number) {
    await this.store.set(`g/${conversationId}`, encodeState(state));
    if (cursor !== undefined) await setJson(this.store, `cur/${conversationId}`, cursor);
  }

  private async cursorOf(conversationId: string): Promise<number> {
    return (await getJson<number>(this.store, `cur/${conversationId}`)) ?? 0;
  }

  private async saveMessage(m: LocalMessage) {
    await setJson(this.store, `msg/${m.conversationId}/${m.id}`, m);
    if (m.seq === null) await setJson(this.store, `out/${m.conversationId}/${m.id}`, m.id);
    else {
      await this.store.delete(`out/${m.conversationId}/${m.id}`);
      await setJson(this.store, `ord/${m.conversationId}/${pad(m.seq)}`, m.id);
    }
  }

  private async deleteLocalMessage(m: LocalMessage, ordKey?: string) {
    await this.store.delete(`msg/${m.conversationId}/${m.id}`);
    await this.store.delete(`vo/${m.conversationId}/${m.id}`);
    if (ordKey) await this.store.delete(ordKey);
    await this.store.delete(`out/${m.conversationId}/${m.id}`);
  }

  /** Ensure we have group state: join via Welcome, create at epoch 0, or wait to be added. */
  private async ensureGroup(conversationId: string): Promise<ClientState | null> {
    const existing = await this.loadState(conversationId);
    if (existing) return existing;
    const identity = this.requireIdentity();

    const welcomes = (await this.transport.listWelcomes(conversationId, identity.deviceId)).sort(
      (a, b) => b.epoch - a.epoch,
    );
    for (const w of welcomes) {
      try {
        const { state, usedRef } = await joinFromWelcome(
          b64.decode(w.welcome),
          (ref) => this.loadKeyPackage(ref),
          this.config,
        );
        await this.saveState(conversationId, state, w.commitSeq);
        await this.store.delete(`kp/${usedRef}`); // one-time key: destroy after use
        await this.transport.deleteWelcome(w.id).catch(() => undefined);
        void this.topUpKeyPackages().catch(() => undefined);
        return state;
      } catch {
        // Stale or not addressed to our current key packages — try the next one.
      }
    }

    const info = await this.getInfo(conversationId);
    if (info.epoch !== 0) return null; // others must add this device
    const fresh = await createGroupState(identity, conversationId, this.config);
    const outcome = await this.reconcile(conversationId, fresh, 0, info.memberIds, true);
    if (outcome === 'conflict') return this.retryJoinAfterConflict(conversationId);
    return outcome;
  }

  private async retryJoinAfterConflict(conversationId: string): Promise<ClientState | null> {
    // Someone else created the group at the same time; their Welcome should be waiting.
    const identity = this.requireIdentity();
    for (const w of await this.transport.listWelcomes(conversationId, identity.deviceId)) {
      try {
        const { state, usedRef } = await joinFromWelcome(
          b64.decode(w.welcome),
          (ref) => this.loadKeyPackage(ref),
          this.config,
        );
        await this.saveState(conversationId, state, w.commitSeq);
        await this.store.delete(`kp/${usedRef}`);
        await this.transport.deleteWelcome(w.id).catch(() => undefined);
        return state;
      } catch {
        /* try next */
      }
    }
    return null;
  }

  /**
   * Bring MLS membership in line with the server roster: add devices of
   * members that aren't in the tree yet, remove revoked devices and users who
   * left. Returns the new state, the unchanged state, or 'conflict'.
   */
  private async reconcile(
    conversationId: string,
    state: ClientState,
    epoch: number,
    memberIds: string[],
    initial = false,
  ): Promise<ClientState | 'conflict'> {
    const identity = this.requireIdentity();
    const devices = await this.transport.listDevices(memberIds);
    for (const d of devices)
      this.directoryCache.set(d.id, {
        deviceId: d.id,
        userId: d.userId,
        identityKey: d.identityKey,
        revoked: d.revoked,
      });
    const active = devices.filter((d) => !d.revoked);
    const current = membersOf(state);
    const removeLeaves = current
      .filter((m) => m.deviceId !== identity.deviceId)
      .filter(
        (m) =>
          !memberIds.includes(m.userId) ||
          !active.some((d) => d.id === m.deviceId && d.identityKey === m.identityKey),
      )
      .map((m) => m.leafIndex);
    const missing = active.filter(
      (d) => d.id !== identity.deviceId && !current.some((m) => m.deviceId === d.id),
    );

    let add: { deviceId: string; keyPackage: KeyPackage }[] = [];
    if (missing.length) {
      const claims = await this.transport.claimKeyPackages(missing.map((d) => d.id));
      add = claims
        .filter((c) => c.keyPackage)
        .flatMap((c) => {
          const decoded = decodeMlsMessage(b64.decode(c.keyPackage!), 0)?.[0];
          return decoded?.wireformat === 'mls_key_package'
            ? [{ deviceId: c.deviceId, keyPackage: decoded.keyPackage }]
            : [];
        });
    }
    if (!add.length && !removeLeaves.length && !initial) return state;

    const result = await commitChanges(state, { add: add.map((a) => a.keyPackage), removeLeaves });
    const clientId = randomId();
    await setJson(this.store, `pc/${conversationId}`, {
      clientId,
      epoch,
      state: b64.encode(encodeState(result.state)),
    });
    try {
      const seq = await this.transport.postCommit({
        conversationId,
        deviceId: identity.deviceId,
        epoch,
        commit: b64.encode(result.commit),
        clientId,
        welcomes: result.welcome
          ? add.map((a) => ({ deviceId: a.deviceId, welcome: b64.encode(result.welcome!) }))
          : [],
      });
      await this.saveState(
        conversationId,
        result.state,
        Math.max(seq, await this.cursorOf(conversationId)),
      );
      await this.store.delete(`pc/${conversationId}`);
      return result.state;
    } catch (error) {
      await this.store.delete(`pc/${conversationId}`);
      const e = toConnectError(error);
      if (e.code === 'epoch_conflict') return 'conflict';
      throw e;
    }
  }

  private async syncLocked(
    conversationId: string,
  ): Promise<{ status: SyncStatus; epoch: number | null }> {
    let state = await this.ensureGroup(conversationId);
    if (!state) return { status: 'waiting_for_access', epoch: null };
    const me = this.requireIdentity().deviceId;

    for (let attempt = 0; attempt < 4; attempt++) {
      // Loaded once, before any envelope is processed: a transport failure here
      // (or anywhere below) aborts the sync without advancing the cursor.
      const roster = await this.getInfo(conversationId);
      let cursor = await this.cursorOf(conversationId);
      for (;;) {
        const page = await this.transport.fetchEnvelopes(conversationId, cursor, FETCH_PAGE);
        let changed = false;
        for (const env of page) {
          const next = await this.processEnvelope(conversationId, state!, env, me, roster);
          if (next === 'broken') {
            await this.store.delete(`g/${conversationId}`);
            await this.store.delete(`cur/${conversationId}`);
            this.emit(conversationId);
            return { status: 'broken', epoch: null };
          }
          state = next;
          cursor = env.seq;
          await this.saveState(conversationId, state, cursor);
          changed = true;
        }
        if (changed) this.emit(conversationId);
        if (page.length < FETCH_PAGE) break;
      }

      const info = await this.getInfo(conversationId);
      if (epochOf(state!) !== info.epoch) continue; // a commit landed meanwhile — fetch again
      const reconciled = await this.reconcile(conversationId, state!, info.epoch, info.memberIds);
      if (reconciled === 'conflict') continue;
      state = reconciled;
      return { status: 'ready', epoch: epochOf(state) };
    }
    return { status: 'ready', epoch: epochOf(state!) };
  }

  private async processEnvelope(
    conversationId: string,
    state: ClientState,
    env: EnvelopeRecord,
    me: string,
    info: ConversationInfo,
  ): Promise<ClientState | 'broken'> {
    const lookupsBefore = this.transientLookups;
    const transient = (error: unknown) =>
      isTransient(error) || this.transientLookups !== lookupsBefore;
    if (env.kind === 'commit') {
      if (env.epoch < epochOf(state)) return state; // already past this epoch (e.g. joined later)
      if (env.senderDeviceId === me) {
        const pending = await getJson<{ clientId: string; state: string }>(
          this.store,
          `pc/${conversationId}`,
        );
        if (pending && pending.clientId === env.clientId) {
          await this.store.delete(`pc/${conversationId}`);
          return decodeState(b64.decode(pending.state), this.config);
        }
        return 'broken'; // our own commit we can't re-apply: rejoin needed
      }
      try {
        return (await processIncoming(state, b64.decode(env.ciphertext))).state;
      } catch (error) {
        // Transient (e.g. a directory lookup failed): abort; retry the commit later.
        if (transient(error)) throw error;
        return 'broken';
      }
    }

    // Application message.
    if (env.senderDeviceId === me) {
      // A deferred control of ours whose post response was lost: apply it now.
      const pending = await getJson<Payload>(this.store, `pp/${conversationId}/${env.clientId}`);
      if (pending && !isContent(pending)) {
        await this.applyControl(conversationId, pending, this.userId, env.createdAt, info);
        await this.dropPending(conversationId, env.clientId);
        return state;
      }
      const local = await getJson<LocalMessage>(
        this.store,
        `msg/${conversationId}/${env.clientId}`,
      );
      if (local && local.seq === null)
        await this.saveMessage({
          ...local,
          seq: env.seq,
          status: 'sent',
          createdAt: env.createdAt,
          expiresAt: env.expiresAt,
        });
      return state;
    }
    // Once MLS has decrypted the message its ratchet has moved on: even if the
    // payload is then rejected, keep the advanced state or the sender's next
    // messages can't be decrypted.
    let advanced = state;
    try {
      const r = await processIncoming(state, b64.decode(env.ciphertext));
      advanced = r.state;
      if (r.kind !== 'application') return r.state;
      const opened = await openPayload(
        conversationId,
        r.plaintext,
        env.senderDeviceId,
        async (deviceId) => {
          const d = await this.lookupDevice(deviceId);
          return d ? b64.decode(d.identityKey) : null;
        },
      );
      const device = await this.lookupDevice(opened.deviceId);
      // The signed device must be the envelope's sender device and belong to the sender.
      if (opened.deviceId !== env.senderDeviceId || device?.userId !== env.senderId)
        throw new Error('sender_mismatch');
      await this.applyIncoming(conversationId, env, opened.payload, info);
      return r.state;
    } catch (error) {
      // A transient failure (e.g. directory lookup offline) must not turn a good
      // message into a permanent placeholder: abort; the cursor stays put.
      // Anything else is final for this envelope, so no input can freeze the chat.
      if (transient(error)) throw error;
      await this.saveMessage({
        id: env.clientId,
        conversationId,
        seq: env.seq,
        senderId: env.senderId,
        senderDeviceId: env.senderDeviceId,
        createdAt: env.createdAt,
        expiresAt: env.expiresAt,
        status: 'undecryptable',
        kind: 'undecryptable',
        reactions: {},
      });
      return advanced;
    }
  }

  private async applyIncoming(
    conversationId: string,
    env: EnvelopeRecord,
    payload: OpenedPayload,
    info: ConversationInfo,
  ) {
    if (payload.t === 'ignored') return; // a newer client's silent control
    if (payload.t === 'unsupported') {
      if (await getJson(this.store, `msg/${conversationId}/${payload.id}`)) return;
      await this.saveMessage({
        id: payload.id,
        conversationId,
        seq: env.seq,
        senderId: env.senderId,
        senderDeviceId: env.senderDeviceId,
        createdAt: env.createdAt,
        expiresAt: env.expiresAt,
        status: 'received',
        kind: 'unsupported',
        reactions: {},
      });
      return;
    }
    if (isContent(payload)) {
      if (await getJson(this.store, `msg/${conversationId}/${payload.id}`)) return; // duplicate
      let p: ContentPayload = payload;
      if (p.t === 'text' && p.mentions)
        p = {
          ...p,
          mentions: validMentions(p.body, p.mentions, info.memberIds),
        };
      const mine = env.senderId === this.userId; // my other device sent it
      if (p.t === 'attachment' && p.attachment.viewOnce && !mine)
        await setJson(this.store, `vo/${conversationId}/${p.id}`, p.attachment);
      await this.saveMessage({
        id: payload.id,
        conversationId,
        seq: env.seq,
        senderId: env.senderId,
        senderDeviceId: env.senderDeviceId,
        createdAt: env.createdAt,
        expiresAt: env.expiresAt,
        status: 'received',
        ...this.contentFields(p, mine),
      });
      return;
    }
    await this.applyControl(conversationId, payload, env.senderId, env.createdAt, info);
  }

  /** LocalMessage fields for a content payload (shared by send and receive). */
  private contentFields(
    p: ContentPayload,
    mine: boolean,
  ): Pick<LocalMessage, 'kind' | 'reactions'> & Partial<LocalMessage> {
    const base = { kind: p.t, reactions: {} as Record<string, string[]> };
    switch (p.t) {
      case 'text':
        return {
          ...base,
          body: p.body,
          replyTo: p.replyTo,
          mentions: p.mentions?.length ? p.mentions : undefined,
          forwarded: p.forwarded,
        };
      case 'attachment': {
        const viewOnce = p.attachment.viewOnce
          ? { kind: p.attachment.kind, consumed: mine }
          : undefined;
        return {
          ...base,
          // View-once: never on the message (key kept apart, see consumeViewOnce).
          attachment: viewOnce ? undefined : p.attachment,
          viewOnce,
          caption: p.caption,
          replyTo: p.replyTo,
          forwarded: p.forwarded,
        };
      }
      case 'contact':
        return {
          ...base,
          contact: { userId: p.userId, username: p.username, displayName: p.displayName },
          forwarded: p.forwarded,
        };
      case 'location':
        return {
          ...base,
          location: { lat: p.lat, lng: p.lng, ...(p.label ? { label: p.label } : {}) },
          forwarded: p.forwarded,
        };
      case 'poll':
        return {
          ...base,
          poll: { question: p.question, options: p.options, multi: p.multi, votes: {} },
        };
    }
  }

  /**
   * Apply a control payload, enforcing the same rules on every device.
   * Returns false (and changes nothing) when the actor isn't allowed; with
   * `dryRun` it only checks.
   *  - delete: only the original sender (also unpins)
   *  - edit: only the sender, on a delivered text/attachment that isn't
   *    view-once or deleted, within 15 min (server times); captions ≤ 2000;
   *    an older edit never replaces a newer one
   *  - pin: anyone in a direct chat; groups follow the admins-only setting
   *  - vote: a valid choice set for the target poll; latest vote wins
   */
  private async applyControl(
    conversationId: string,
    payload: Payload,
    actorId: string,
    at: string,
    info: ConversationInfo,
    dryRun = false,
  ): Promise<boolean> {
    if (isContent(payload)) return false;
    const key = `msg/${conversationId}/${payload.target}`;
    const target = await getJson<LocalMessage>(this.store, key);
    if (payload.t === 'pin') {
      if (payload.pinned && (!target || target.deleted)) return false;
      if (!mayPin(info, actorId)) return false;
      if (dryRun) return true;
      const pins = applyPin(await this.listPins(conversationId), {
        messageId: payload.target,
        pinned: payload.pinned,
        by: actorId,
        at,
      });
      await setJson(this.store, `pins/${conversationId}`, pins);
      return true;
    }
    if (!target || target.deleted) return false;
    switch (payload.t) {
      case 'delete': {
        if (target.senderId !== actorId) return false;
        if (dryRun) return true;
        await setJson(this.store, key, {
          ...target,
          deleted: true,
          body: undefined,
          attachment: undefined,
          caption: undefined,
          mentions: undefined,
          contact: undefined,
          location: undefined,
          poll: undefined,
          viewOnce: undefined,
          edited: undefined,
          editedAt: undefined,
        } satisfies LocalMessage);
        await this.store.delete(`vo/${conversationId}/${target.id}`);
        const pins = (await getJson<PinEntry[]>(this.store, `pins/${conversationId}`)) ?? [];
        if (pins.some((p) => p.messageId === target.id))
          await setJson(
            this.store,
            `pins/${conversationId}`,
            pins.filter((p) => p.messageId !== target.id),
          );
        return true;
      }
      case 'edit': {
        if (target.senderId !== actorId) return false;
        if (target.kind !== 'text' && target.kind !== 'attachment') return false;
        if (target.viewOnce) return false;
        if (target.status === 'sending' || target.status === 'failed') return false;
        if (target.kind === 'attachment' && payload.body.length > 2000) return false;
        if (!withinEditWindow(target.createdAt, at)) return false;
        if (target.editedAt && Date.parse(at) < Date.parse(target.editedAt)) return false;
        if (dryRun) return true;
        const edited: LocalMessage =
          target.kind === 'text'
            ? {
                ...target,
                body: payload.body,
                mentions: validMentions(payload.body, payload.mentions, info.memberIds),
              }
            : { ...target, caption: payload.body };
        await setJson(this.store, key, { ...edited, edited: true, editedAt: at });
        return true;
      }
      case 'vote': {
        if (target.kind !== 'poll' || !target.poll) return false;
        const choices = normalizeVote(target.poll, payload.choices);
        if (!choices) return false;
        if (dryRun) return true;
        const votes = { ...target.poll.votes };
        if (choices.length) votes[actorId] = choices;
        else delete votes[actorId];
        await setJson(this.store, key, { ...target, poll: { ...target.poll, votes } });
        return true;
      }
      case 'reaction': {
        if (dryRun) return true;
        const users = new Set(target.reactions[payload.emoji] ?? []);
        if (payload.remove) users.delete(actorId);
        else {
          // One reaction per person: remove theirs elsewhere first.
          for (const [emoji, list] of Object.entries(target.reactions))
            target.reactions[emoji] = list.filter((u) => u !== actorId);
          users.add(actorId);
        }
        target.reactions[payload.emoji] = [...users];
        for (const [emoji, list] of Object.entries(target.reactions))
          if (!list.length) delete target.reactions[emoji];
        await setJson(this.store, key, target);
        return true;
      }
    }
  }

  /**
   * Encrypt-and-post with crash/retry safety:
   *  - the advanced ratchet state is persisted BEFORE posting (no key reuse),
   *  - the exact ciphertext is kept so retries resend identical bytes,
   *  - a stale epoch triggers sync + re-encryption under the new epoch.
   */
  private async deliverLocked(
    conversationId: string,
    id: string,
    attachmentPaths: string[] | undefined,
  ): Promise<LocalMessage | null> {
    const identity = this.requireIdentity();
    const payload = await getJson<Payload>(this.store, `pp/${conversationId}/${id}`);
    if (!payload) return this.getMessage(conversationId, id);
    let outbound = await getJson<PendingOutbound>(this.store, `ob/${conversationId}/${id}`);

    for (let attempt = 0; attempt < 4; attempt++) {
      try {
        const synced = await this.syncLocked(conversationId);
        if (synced.status !== 'ready')
          throw new ConnectError('not_ready', 'Secure session is not ready yet');
        // Sync may have found our own already-posted control (lost response) and applied it.
        if (!(await getJson(this.store, `pp/${conversationId}/${id}`)))
          return this.getMessage(conversationId, id);
        const state = (await this.loadState(conversationId))!;
        if (!outbound || outbound.epoch !== epochOf(state)) {
          const sealed = sealPayload(conversationId, identity.deviceId, identity.signKey, payload);
          const enc = await encryptApplication(state, sealed);
          await this.saveState(conversationId, enc.state);
          outbound = {
            id,
            epoch: epochOf(state),
            ciphertext: b64.encode(enc.ciphertext),
            attachmentPaths: attachmentPaths ?? outbound?.attachmentPaths ?? [],
          };
          await setJson(this.store, `ob/${conversationId}/${id}`, outbound);
        }
        let posted;
        try {
          posted = await this.transport.postApplication({
            conversationId,
            deviceId: identity.deviceId,
            epoch: outbound.epoch,
            ciphertext: outbound.ciphertext,
            clientId: id,
            attachmentPaths: outbound.attachmentPaths,
          });
        } catch (error) {
          const e = toConnectError(error);
          if (e.code !== 'duplicate') throw e;
          posted = await this.transport.findOwnEnvelope(identity.deviceId, id);
          if (!posted) throw e;
        }
        await this.dropPending(conversationId, id);
        if (!isContent(payload)) {
          const applied = await this.applyControl(
            conversationId,
            payload,
            this.userId,
            posted.createdAt,
            await this.cachedInfo(conversationId),
          );
          this.emit(conversationId);
          // Posted, but by server time it isn't allowed (e.g. edit window passed):
          // receivers ignore it too. Tell the caller so the UI can say so.
          // (Reactions/deletes keep their old contract: no error.)
          if (!applied && CHECKED.has(payload.t))
            throw new ConnectError('forbidden', `${payload.t}_not_allowed`);
        }
        const local = await this.getMessage(conversationId, id);
        if (local) {
          const sent: LocalMessage = {
            ...local,
            seq: posted.seq,
            status: 'sent',
            createdAt: posted.createdAt,
            expiresAt: posted.expiresAt,
          };
          await this.saveMessage(sent);
          this.emit(conversationId);
          return sent;
        }
        this.emit(conversationId);
        return null;
      } catch (error) {
        const e = toConnectError(error);
        if (e.code === 'epoch_stale' || e.code === 'epoch_conflict') {
          outbound = null; // re-encrypt under the new epoch after syncing
          await this.store.delete(`ob/${conversationId}/${id}`);
          continue;
        }
        // Not stored for sure → drop; maybe stored ('network'/'unknown') → stays queued.
        if (!isContent(payload) && !QUEUED_CODES.has(e.code))
          await this.dropPending(conversationId, id);
        const local = await this.getMessage(conversationId, id);
        if (local) {
          await this.saveMessage({ ...local, status: 'failed' });
          this.emit(conversationId);
        }
        throw e;
      }
    }
    // Every attempt was rejected for a stale epoch: the server stored nothing.
    if (!isContent(payload)) await this.dropPending(conversationId, id);
    throw new ConnectError('epoch_stale', 'Could not catch up with group changes');
  }

  private async dropPending(conversationId: string, id: string) {
    await this.store.delete(`ob/${conversationId}/${id}`);
    await this.store.delete(`pp/${conversationId}/${id}`);
    await this.store.delete(`pq/${conversationId}/${id}`);
  }
}

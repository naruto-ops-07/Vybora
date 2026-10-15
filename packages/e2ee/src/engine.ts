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
import { openPayload, sealPayload, type AttachmentRef, type Payload } from './payload';
import { getJson, setJson, type KeyValueStore } from './store';
import {
  ConnectError,
  toConnectError,
  type ConnectTransport,
  type EnvelopeRecord,
  type OwnDeviceRecord,
} from './transport';

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
  kind: 'text' | 'attachment' | 'undecryptable';
  body?: string;
  attachment?: AttachmentRef;
  caption?: string;
  replyTo?: ReplyRef;
  reactions: Record<string, string[]>;
  deleted?: boolean;
}

export type OutgoingContent =
  | { t: 'text'; body: string; replyTo?: ReplyRef }
  | { t: 'attachment'; attachment: AttachmentRef; caption?: string; replyTo?: ReplyRef }
  | { t: 'reaction'; target: string; emoji: string; remove?: boolean }
  | { t: 'delete'; target: string };

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
 */
export class ConnectEngine {
  private identity: DeviceIdentity | null = null;
  private readonly directoryCache = new Map<string, DirectoryDevice>();
  private readonly locks = new Map<string, Promise<unknown>>();
  private readonly config: ClientConfig;
  private listeners = new Set<(conversationId: string) => void>();

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
    return this.locked(conversationId, () => this.syncLocked(conversationId));
  }

  /** Send content. Resolves once the server has durably stored the ciphertext. */
  send(
    conversationId: string,
    content: OutgoingContent,
    attachmentPaths: string[] = [],
  ): Promise<LocalMessage | null> {
    return this.locked(conversationId, async () => {
      const id = randomId();
      const payload = { v: 1, id, ...content } as Payload;
      let local: LocalMessage | null = null;
      if (content.t === 'text' || content.t === 'attachment') {
        local = {
          id,
          conversationId,
          seq: null,
          senderId: this.userId,
          senderDeviceId: this.deviceId,
          createdAt: new Date().toISOString(),
          expiresAt: null,
          status: 'sending',
          kind: content.t,
          body: content.t === 'text' ? content.body : undefined,
          attachment: content.t === 'attachment' ? content.attachment : undefined,
          caption: content.t === 'attachment' ? content.caption : undefined,
          replyTo: content.replyTo,
          reactions: {},
        };
        await this.saveMessage(local);
        this.emit(conversationId);
      } else {
        // Reactions/deletes apply locally right away, too.
        await this.applyControl(conversationId, payload, this.userId);
      }
      await setJson(this.store, `pp/${conversationId}/${id}`, payload);
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
    ]) {
      for (const k of await this.store.list(prefix)) await this.store.delete(k);
    }
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
    extra: { caption?: string; replyTo?: ReplyRef } = {},
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

  private async lookupDevice(deviceId: string): Promise<DirectoryDevice | null> {
    const cached = this.directoryCache.get(deviceId);
    if (cached) return cached;
    const d = await this.transport.getDevice(deviceId);
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

    const info = await this.transport.getConversation(conversationId);
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
      let cursor = await this.cursorOf(conversationId);
      for (;;) {
        const page = await this.transport.fetchEnvelopes(conversationId, cursor, FETCH_PAGE);
        let changed = false;
        for (const env of page) {
          const next = await this.processEnvelope(conversationId, state!, env, me);
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

      const info = await this.transport.getConversation(conversationId);
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
  ): Promise<ClientState | 'broken'> {
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
      } catch {
        return 'broken';
      }
    }

    // Application message.
    if (env.senderDeviceId === me) {
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
    try {
      const r = await processIncoming(state, b64.decode(env.ciphertext));
      if (r.kind !== 'application') return r.state;
      const opened = await openPayload(conversationId, r.plaintext, async (deviceId) => {
        const d = await this.lookupDevice(deviceId);
        return d ? b64.decode(d.identityKey) : null;
      });
      const device = await this.lookupDevice(opened.deviceId);
      // The signed device must be the envelope's sender device and belong to the sender.
      if (opened.deviceId !== env.senderDeviceId || device?.userId !== env.senderId)
        throw new Error('sender_mismatch');
      await this.applyIncoming(conversationId, env, opened.payload);
      return r.state;
    } catch {
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
      return state;
    }
  }

  private async applyIncoming(conversationId: string, env: EnvelopeRecord, payload: Payload) {
    if (payload.t === 'text' || payload.t === 'attachment') {
      if (await getJson(this.store, `msg/${conversationId}/${payload.id}`)) return; // duplicate
      await this.saveMessage({
        id: payload.id,
        conversationId,
        seq: env.seq,
        senderId: env.senderId,
        senderDeviceId: env.senderDeviceId,
        createdAt: env.createdAt,
        expiresAt: env.expiresAt,
        status: 'received',
        kind: payload.t,
        body: payload.t === 'text' ? payload.body : undefined,
        attachment: payload.t === 'attachment' ? payload.attachment : undefined,
        caption: payload.t === 'attachment' ? payload.caption : undefined,
        replyTo: payload.replyTo,
        reactions: {},
      });
      return;
    }
    await this.applyControl(conversationId, payload, env.senderId);
  }

  /** Reactions and deletions (only the original sender may delete). */
  private async applyControl(conversationId: string, payload: Payload, actorId: string) {
    if (payload.t !== 'reaction' && payload.t !== 'delete') return;
    const target = await getJson<LocalMessage>(
      this.store,
      `msg/${conversationId}/${payload.target}`,
    );
    if (!target) return;
    if (payload.t === 'delete') {
      if (target.senderId !== actorId) return;
      await setJson(this.store, `msg/${conversationId}/${target.id}`, {
        ...target,
        deleted: true,
        body: undefined,
        attachment: undefined,
        caption: undefined,
      } satisfies LocalMessage);
      return;
    }
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
    await setJson(this.store, `msg/${conversationId}/${target.id}`, target);
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
        await this.store.delete(`ob/${conversationId}/${id}`);
        await this.store.delete(`pp/${conversationId}/${id}`);
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
        const local = await this.getMessage(conversationId, id);
        if (local) {
          await this.saveMessage({ ...local, status: 'failed' });
          this.emit(conversationId);
        }
        throw e;
      }
    }
    throw new ConnectError('epoch_stale', 'Could not catch up with group changes');
  }
}

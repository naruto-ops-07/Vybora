import { randomId } from '../codec';
import {
  ConnectError,
  type ConnectTransport,
  type ConversationInfo,
  type DeviceRecord,
  type EnvelopeRecord,
  type PostedEnvelope,
  type WelcomeRecord,
} from '../transport';

/**
 * In-memory stand-in for the server (ciphertext only), used to run real
 * engines against each other in unit tests. Mirrors the database rules that
 * matter to the engine: epoch checks, one-time key packages, idempotent posts.
 */
export class MemoryServer {
  devices = new Map<string, DeviceRecord & { platform: string; label: string }>();
  keyPackages: { id: string; deviceId: string; userId: string; kp: string; claimed: boolean }[] =
    [];
  conversations = new Map<
    string,
    {
      kind: 'direct' | 'group';
      epoch: number;
      members: Map<string, 'admin' | 'member'>;
      policy: 'everyone' | 'admins';
    }
  >();
  envelopes: (EnvelopeRecord & { attachmentPaths: string[] })[] = [];
  welcomes: (WelcomeRecord & { deviceId: string })[] = [];
  blobs = new Map<string, Uint8Array>();
  /** Server clock (overridable to test time windows). */
  now = () => new Date();
  private seq = 0;

  createConversation(kind: 'direct' | 'group', ownerId: string, memberIds: string[]): string {
    const id = randomId();
    const members = new Map<string, 'admin' | 'member'>([[ownerId, 'admin']]);
    for (const m of memberIds)
      if (m !== ownerId) members.set(m, kind === 'direct' ? 'admin' : 'member');
    this.conversations.set(id, { kind, epoch: 0, members, policy: 'everyone' });
    return id;
  }

  transport(userId: string): ConnectTransport {
    // eslint-disable-next-line @typescript-eslint/no-this-alias -- closures below share this server
    const s = this;
    const conv = (id: string) => {
      const c = s.conversations.get(id);
      if (!c || !c.members.has(userId)) throw new ConnectError('forbidden', 'not_a_member');
      return c;
    };
    return {
      async registerDevice(input) {
        const id = randomId();
        s.devices.set(id, {
          id,
          userId,
          identityKey: input.identityKey,
          createdAt: s.now().toISOString(),
          revoked: false,
          platform: input.platform,
          label: input.label,
        });
        return id;
      },
      async revokeDevice(deviceId) {
        const d = s.devices.get(deviceId);
        if (d && d.userId === userId) d.revoked = true;
      },
      async touchDevice() {},
      async countUnclaimedKeyPackages(deviceId) {
        return s.keyPackages.filter((k) => k.deviceId === deviceId && !k.claimed).length;
      },
      async publishKeyPackages(deviceId, packages) {
        for (const kp of packages)
          s.keyPackages.push({ id: randomId(), deviceId, userId, kp, claimed: false });
      },
      async getDevice(deviceId) {
        const d = s.devices.get(deviceId);
        return d ? pub(d) : null;
      },
      async listDevices(userIds) {
        return [...s.devices.values()].filter((d) => userIds.includes(d.userId)).map(pub);
      },
      async listOwnDevices() {
        return [...s.devices.values()]
          .filter((d) => d.userId === userId)
          .map((d) => ({ ...d, lastSeenAt: d.createdAt }));
      },
      async claimKeyPackages(deviceIds) {
        return deviceIds.map((deviceId) => {
          const k = s.keyPackages.find((x) => x.deviceId === deviceId && !x.claimed);
          if (k) k.claimed = true;
          return {
            deviceId,
            userId: s.devices.get(deviceId)?.userId ?? '',
            keyPackage: k?.kp ?? null,
          };
        });
      },
      async getConversation(id): Promise<ConversationInfo> {
        const c = conv(id);
        return {
          id,
          kind: c.kind,
          epoch: c.epoch,
          memberIds: [...c.members.keys()],
          adminIds: [...c.members].filter(([, r]) => r === 'admin').map(([u]) => u),
          settingsPolicy: c.policy,
        };
      },
      async listWelcomes(id, deviceId) {
        conv(id);
        return s.welcomes.filter((w) => w.conversationId === id && w.deviceId === deviceId);
      },
      async deleteWelcome(id) {
        s.welcomes = s.welcomes.filter((w) => w.id !== id);
      },
      async fetchEnvelopes(id, afterSeq, limit) {
        conv(id);
        return s.envelopes
          .filter((e) => e.conversationId === id && e.seq > afterSeq)
          .slice(0, limit)
          .map(({ attachmentPaths: _a, ...e }) => ({ ...e }));
      },
      async postCommit(input) {
        const c = conv(input.conversationId);
        if (c.epoch !== input.epoch) throw new ConnectError('epoch_conflict', 'epoch_conflict');
        const seq = ++s.seq;
        s.envelopes.push({
          seq,
          conversationId: input.conversationId,
          senderId: userId,
          senderDeviceId: input.deviceId,
          epoch: input.epoch,
          kind: 'commit',
          ciphertext: input.commit,
          clientId: input.clientId,
          createdAt: s.now().toISOString(),
          expiresAt: null,
          attachmentPaths: [],
        });
        c.epoch += 1;
        for (const w of input.welcomes)
          s.welcomes.push({
            id: randomId(),
            conversationId: input.conversationId,
            deviceId: w.deviceId,
            epoch: c.epoch,
            commitSeq: seq,
            welcome: w.welcome,
          });
        return seq;
      },
      async postApplication(input): Promise<PostedEnvelope> {
        const c = conv(input.conversationId);
        if (c.epoch !== input.epoch) throw new ConnectError('epoch_stale', 'epoch_stale');
        if (
          s.envelopes.some(
            (e) => e.senderDeviceId === input.deviceId && e.clientId === input.clientId,
          )
        )
          throw new ConnectError('duplicate', 'duplicate key');
        const e = {
          seq: ++s.seq,
          conversationId: input.conversationId,
          senderId: userId,
          senderDeviceId: input.deviceId,
          epoch: input.epoch,
          kind: 'application' as const,
          ciphertext: input.ciphertext,
          clientId: input.clientId,
          createdAt: s.now().toISOString(),
          expiresAt: null,
          attachmentPaths: input.attachmentPaths,
        };
        s.envelopes.push(e);
        return { seq: e.seq, createdAt: e.createdAt, expiresAt: null };
      },
      async findOwnEnvelope(deviceId, clientId) {
        const e = s.envelopes.find((x) => x.senderDeviceId === deviceId && x.clientId === clientId);
        return e ? { seq: e.seq, createdAt: e.createdAt, expiresAt: e.expiresAt } : null;
      },
      async uploadAttachment(path, ciphertext) {
        const convId = path.split('/')[0]!;
        conv(convId);
        s.blobs.set(path, ciphertext.slice());
      },
      async downloadAttachment(path) {
        conv(path.split('/')[0]!); // bucket access is per conversation
        const b = s.blobs.get(path);
        if (!b) throw new ConnectError('forbidden', 'object not visible');
        return b.slice();
      },
    };
  }
}

function pub(d: DeviceRecord): DeviceRecord {
  return {
    id: d.id,
    userId: d.userId,
    identityKey: d.identityKey,
    createdAt: d.createdAt,
    revoked: d.revoked,
  };
}

import {
  toConnectError,
  type ConnectTransport,
  type DeviceRecord,
  type EnvelopeRecord,
  type PostedEnvelope,
  type WelcomeRecord,
} from '@vybora/e2ee';
import type { Actor, TestDb } from './db';

type Row = Record<string, unknown>;
const PUBLIC_DEVICE_COLUMNS = 'id, user_id, identity_key, created_at, revoked_at';
const iso = (v: unknown) => (v instanceof Date ? v.toISOString() : v == null ? null : String(v));
const num = (v: unknown) => Number(v);

/** Shared fake object store standing in for the Storage API (RLS still checked via storage.objects). */
export const objectStore = new Map<string, Uint8Array>();

/**
 * ConnectTransport over the real migrated database, acting as `user` under
 * RLS — exactly what supabase-js would do through PostgREST.
 */
export class PgTransport implements ConnectTransport {
  /** Set to make the next postApplication fail AFTER the server stored it (lost response). */
  dropNextPostResponse = false;

  constructor(
    private readonly db: TestDb,
    private readonly user: { id: string },
  ) {}

  private async q<T = Row>(sql: string, params: unknown[] = []): Promise<T[]> {
    try {
      return await this.db.as<T>(this.user as Actor, sql, params);
    } catch (error) {
      throw toConnectError(error);
    }
  }

  private device(r: Row): DeviceRecord {
    return {
      id: String(r.id),
      userId: String(r.user_id),
      identityKey: String(r.identity_key),
      createdAt: iso(r.created_at)!,
      revoked: r.revoked_at != null,
    };
  }

  async registerDevice(input: { identityKey: string; platform: string; label: string }) {
    const [r] = await this.q<{ id: string }>(
      `insert into devices (user_id, platform, label, identity_key) values ($1, $2, $3, $4) returning id`,
      [this.user.id, input.platform, input.label, input.identityKey],
    );
    return r!.id;
  }
  async revokeDevice(deviceId: string) {
    await this.q(`update devices set revoked_at = now() where id = $1`, [deviceId]);
  }
  async touchDevice(deviceId: string) {
    await this.q(`update devices set last_seen_at = now() where id = $1`, [deviceId]);
  }
  async countUnclaimedKeyPackages(deviceId: string) {
    const [r] = await this.q<{ n: number }>(
      `select count(*)::int as n from key_packages where device_id = $1 and claimed_at is null`,
      [deviceId],
    );
    return r!.n;
  }
  async publishKeyPackages(deviceId: string, packages: string[]) {
    for (const kp of packages) {
      await this.q(
        `insert into key_packages (device_id, user_id, key_package) values ($1, $2, $3)`,
        [deviceId, this.user.id, kp],
      );
    }
  }
  async getDevice(deviceId: string) {
    const [r] = await this.q(`select ${PUBLIC_DEVICE_COLUMNS} from devices where id = $1`, [
      deviceId,
    ]);
    return r ? this.device(r) : null;
  }
  async listDevices(userIds: string[]) {
    return (
      await this.q(
        `select ${PUBLIC_DEVICE_COLUMNS} from devices where user_id = any($1::uuid[]) order by created_at`,
        [userIds],
      )
    ).map((r) => this.device(r));
  }
  async listOwnDevices() {
    return (await this.q(`select * from my_devices()`)).map((r) => ({
      ...this.device(r),
      platform: String(r.platform),
      label: String(r.label),
      lastSeenAt: iso(r.last_seen_at)!,
    }));
  }
  async claimKeyPackages(deviceIds: string[]) {
    const rows = await this.q<{ device_id: string; user_id: string; key_package: string | null }>(
      `select * from claim_key_packages($1::uuid[])`,
      [deviceIds],
    );
    return rows.map((r) => ({
      deviceId: r.device_id,
      userId: r.user_id,
      keyPackage: r.key_package,
    }));
  }
  async getConversation(conversationId: string) {
    const [c] = await this.q<{
      kind: 'direct' | 'group';
      mls_epoch: string;
      settings_policy: string;
    }>(`select kind, mls_epoch, settings_policy from conversations where id = $1`, [
      conversationId,
    ]);
    if (!c) throw toConnectError({ message: 'not_a_member' });
    const members = await this.q<{ user_id: string; role: string }>(
      `select user_id, role from conversation_members where conversation_id = $1`,
      [conversationId],
    );
    return {
      id: conversationId,
      kind: c.kind,
      epoch: num(c.mls_epoch),
      memberIds: members.map((m) => m.user_id),
      adminIds: members.filter((m) => m.role === 'admin').map((m) => m.user_id),
      settingsPolicy: (c.settings_policy === 'admins' ? 'admins' : 'everyone') as
        'admins' | 'everyone',
    };
  }
  async listWelcomes(conversationId: string, deviceId: string): Promise<WelcomeRecord[]> {
    const rows = await this.q(
      `select * from mls_welcomes where conversation_id = $1 and device_id = $2`,
      [conversationId, deviceId],
    );
    return rows.map((r) => ({
      id: String(r.id),
      conversationId,
      epoch: num(r.epoch),
      commitSeq: num(r.commit_seq),
      welcome: String(r.welcome),
    }));
  }
  async deleteWelcome(id: string) {
    await this.q(`delete from mls_welcomes where id = $1`, [id]);
  }
  async fetchEnvelopes(
    conversationId: string,
    afterSeq: number,
    limit: number,
  ): Promise<EnvelopeRecord[]> {
    const rows = await this.q(
      `select * from mls_envelopes where conversation_id = $1 and seq > $2 order by seq limit $3`,
      [conversationId, afterSeq, limit],
    );
    return rows.map((r) => ({
      seq: num(r.seq),
      conversationId,
      senderId: String(r.sender_id),
      senderDeviceId: r.sender_device_id ? String(r.sender_device_id) : null,
      epoch: num(r.epoch),
      kind: r.kind as 'commit' | 'application',
      ciphertext: String(r.ciphertext),
      clientId: String(r.client_id),
      createdAt: iso(r.created_at)!,
      expiresAt: iso(r.expires_at),
    }));
  }
  async postCommit(input: {
    conversationId: string;
    deviceId: string;
    epoch: number;
    commit: string;
    clientId: string;
    welcomes: { deviceId: string; welcome: string }[];
  }) {
    const [r] = await this.q<{ seq: string }>(
      `select public.post_commit($1, $2, $3, $4, $5, $6::jsonb) as seq`,
      [
        input.conversationId,
        input.deviceId,
        input.epoch,
        input.commit,
        input.clientId,
        JSON.stringify(input.welcomes.map((w) => ({ device_id: w.deviceId, welcome: w.welcome }))),
      ],
    );
    return num(r!.seq);
  }
  async postApplication(input: {
    conversationId: string;
    deviceId: string;
    epoch: number;
    ciphertext: string;
    clientId: string;
    attachmentPaths: string[];
  }): Promise<PostedEnvelope> {
    const [r] = await this.q(
      `insert into mls_envelopes (conversation_id, sender_id, sender_device_id, epoch, kind, ciphertext, client_id, attachment_paths)
       values ($1, $2, $3, $4, 'application', $5, $6, $7::text[]) returning seq, created_at, expires_at`,
      [
        input.conversationId,
        this.user.id,
        input.deviceId,
        input.epoch,
        input.ciphertext,
        input.clientId,
        input.attachmentPaths,
      ],
    );
    if (this.dropNextPostResponse) {
      this.dropNextPostResponse = false;
      throw toConnectError(new TypeError('Network request failed'));
    }
    return { seq: num(r!.seq), createdAt: iso(r!.created_at)!, expiresAt: iso(r!.expires_at) };
  }
  async findOwnEnvelope(deviceId: string, clientId: string) {
    const [r] = await this.q(
      `select seq, created_at, expires_at from mls_envelopes where sender_device_id = $1 and client_id = $2`,
      [deviceId, clientId],
    );
    return r
      ? { seq: num(r.seq), createdAt: iso(r.created_at)!, expiresAt: iso(r.expires_at) }
      : null;
  }
  async uploadAttachment(path: string, ciphertext: Uint8Array) {
    await this.db.upload(this.user as Actor, 'connect', path, 'application/octet-stream');
    objectStore.set(path, ciphertext.slice());
  }
  async downloadAttachment(path: string) {
    const visible = await this.q(
      `select id from storage.objects where bucket_id = 'connect' and name = $1`,
      [path],
    );
    if (!visible.length || !objectStore.has(path))
      throw toConnectError({ message: 'permission denied: object not visible' });
    return objectStore.get(path)!.slice();
  }
}

import { randomBytes, randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { expectDenied, TestDb } from './harness/db';
import { follow } from './harness/fixtures';

type User = { id: string; username: string };
let db: TestDb;
beforeAll(async () => {
  db = await TestDb.create();
});
afterAll(async () => db.close());

const identityKey = () => randomBytes(32).toString('base64');
const blob = (n = 160) => randomBytes(n).toString('base64');

async function registerDevice(u: User, platform = 'ios'): Promise<string> {
  const [row] = await db.as<{ id: string }>(
    u,
    `insert into devices (user_id, platform, label, identity_key) values ($1, $2, 'Test device', $3) returning id`,
    [u.id, platform, identityKey()],
  );
  return row!.id;
}

async function publish(u: User, deviceId: string, n = 2) {
  for (let i = 0; i < n; i++) {
    await db.as(
      u,
      `insert into key_packages (device_id, user_id, key_package) values ($1, $2, $3)`,
      [deviceId, u.id, blob()],
    );
  }
}

async function secureChat(
  owner: User,
  kind: 'direct' | 'group',
  members: User[],
  title?: string,
): Promise<string> {
  const [row] = await db.as<{ id: string }>(
    owner,
    `select public.create_secure_conversation($1, $2::uuid[], $3) as id`,
    [kind, members.map((m) => m.id), title ?? null],
  );
  return row!.id;
}

async function commit(
  u: User,
  conv: string,
  device: string,
  epoch: number,
  welcomes: { device_id: string; welcome: string }[] = [],
) {
  const [row] = await db.as<{ seq: string }>(
    u,
    `select public.post_commit($1, $2, $3, $4, $5, $6::jsonb) as seq`,
    [conv, device, epoch, blob(), randomUUID(), JSON.stringify(welcomes)],
  );
  return Number(row!.seq);
}

async function sendCipher(
  u: User,
  conv: string,
  device: string,
  epoch: number,
  clientId = randomUUID(),
) {
  const [row] = await db.as<{ seq: string; expires_at: Date | null }>(
    u,
    `insert into mls_envelopes (conversation_id, sender_id, sender_device_id, epoch, kind, ciphertext, client_id)
     values ($1, $2, $3, $4, 'application', $5, $6) returning seq, expires_at`,
    [conv, u.id, device, epoch, blob(), clientId],
  );
  return { seq: Number(row!.seq), expiresAt: row!.expires_at };
}

describe('device directory', () => {
  it('lets anyone signed in read public identity keys, but only owners register or revoke', async () => {
    const alice = await db.createUser('dir_alice');
    const bob = await db.createUser('dir_bob');
    const dev = await registerDevice(alice);
    expect(
      await db.as(bob, `select id, identity_key from devices where id = $1`, [dev]),
    ).toHaveLength(1);
    await expectDenied(db.as('anon', `select id from devices`), /permission denied/);

    await expectDenied(
      db.as(bob, `insert into devices (user_id, platform, identity_key) values ($1, 'web', $2)`, [
        alice.id,
        identityKey(),
      ]),
      /row-level security/,
    );
    await db.as(bob, `update devices set revoked_at = now() where id = $1`, [dev]);
    const [still] = await db.admin<{ revoked_at: Date | null }>(
      `select revoked_at from devices where id = $1`,
      [dev],
    );
    expect(still!.revoked_at).toBeNull();
  });

  it('keeps device labels and last-seen times private to the owner', async () => {
    const alice = await db.createUser('dir_private_alice');
    const bob = await db.createUser('dir_private_bob');
    const dev = await registerDevice(alice, 'android');
    for (const column of ['label', 'platform', 'last_seen_at', '*']) {
      await expectDenied(
        db.as(bob, `select ${column} from devices where id = $1`, [dev]),
        /permission denied/,
      );
    }
    const mine = await db.as<{ id: string; label: string; platform: string }>(
      alice,
      `select id, label, platform from my_devices()`,
    );
    expect(mine).toEqual([{ id: dev, label: 'Test device', platform: 'android' }]);
    expect(await db.as(bob, `select id from my_devices()`)).toEqual([]);
    await expectDenied(db.as('anon', `select * from my_devices()`), /permission denied/);
  });

  it('makes revocation permanent and purges unclaimed key packages', async () => {
    const u = await db.createUser('dir_revoke');
    const dev = await registerDevice(u);
    await publish(u, dev, 3);
    await db.as(u, `update devices set revoked_at = now() where id = $1`, [dev]);
    await expectDenied(
      db.as(u, `update devices set revoked_at = null where id = $1`, [dev]),
      /permanent/,
    );
    expect(
      await db.admin(`select * from key_packages where device_id = $1 and claimed_at is null`, [
        dev,
      ]),
    ).toEqual([]);
    expect(
      await db.admin(
        `select * from audit_logs where entity_id = $1 and action = 'connect.device_revoked'`,
        [dev],
      ),
    ).toHaveLength(1);
    // A revoked device can no longer publish keys.
    await expectDenied(publish(u, dev, 1), /device_not_active/);
  });

  it('rejects malformed identity keys', async () => {
    const u = await db.createUser('dir_badkey');
    await expectDenied(
      db.as(
        u,
        `insert into devices (user_id, platform, identity_key) values ($1, 'ios', 'not-a-key')`,
        [u.id],
      ),
      /check constraint/,
    );
  });
});

describe('key packages', () => {
  it('are private to their owner and can only be obtained by claiming', async () => {
    const owner = await db.createUser('kp_owner');
    const other = await db.createUser('kp_other');
    const dev = await registerDevice(owner);
    await publish(owner, dev, 2);
    expect(await db.as(other, `select * from key_packages`)).toEqual([]);
    expect(await db.as(owner, `select * from key_packages`)).toHaveLength(2);
    await expectDenied(
      db.as(
        other,
        `insert into key_packages (device_id, user_id, key_package) values ($1, $2, $3)`,
        [dev, owner.id, blob()],
      ),
      /row-level security/,
    );
  });

  it('claims atomically: each key package is handed out exactly once', async () => {
    const owner = await db.createUser('kp_claim_owner');
    const a = await db.createUser('kp_claimer_a');
    const b = await db.createUser('kp_claimer_b');
    const dev = await registerDevice(owner);
    await publish(owner, dev, 2);
    const [c1] = await db.as<{ key_package_id: string }>(
      a,
      `select * from claim_key_packages($1::uuid[])`,
      [[dev]],
    );
    const [c2] = await db.as<{ key_package_id: string }>(
      b,
      `select * from claim_key_packages($1::uuid[])`,
      [[dev]],
    );
    const [c3] = await db.as<{ key_package_id: string | null }>(
      a,
      `select * from claim_key_packages($1::uuid[])`,
      [[dev]],
    );
    expect(c1!.key_package_id).toBeTruthy();
    expect(c2!.key_package_id).toBeTruthy();
    expect(c1!.key_package_id).not.toBe(c2!.key_package_id);
    expect(c3!.key_package_id).toBeNull(); // exhausted — never reused
    const claimed = await db.admin<{ n: number }>(
      `select count(*)::int as n from key_packages where device_id = $1 and claimed_at is not null`,
      [dev],
    );
    expect(claimed[0]!.n).toBe(2);
  });

  it('refuses claims across a block or a "people I follow" privacy setting', async () => {
    const owner = await db.createUser('kp_private_owner');
    const stranger = await db.createUser('kp_stranger');
    const blocked = await db.createUser('kp_blocked');
    const dev = await registerDevice(owner);
    await publish(owner, dev, 3);
    await db.as(
      owner,
      `update user_settings set message_privacy = 'following' where user_id = $1`,
      [owner.id],
    );
    await db.as(owner, `insert into blocks (blocker_id, blocked_id) values ($1, $2)`, [
      owner.id,
      blocked.id,
    ]);
    expect(await db.as(stranger, `select * from claim_key_packages($1::uuid[])`, [[dev]])).toEqual(
      [],
    );
    expect(await db.as(blocked, `select * from claim_key_packages($1::uuid[])`, [[dev]])).toEqual(
      [],
    );
    await follow(db, owner, stranger);
    expect(
      await db.as(stranger, `select * from claim_key_packages($1::uuid[])`, [[dev]]),
    ).toHaveLength(1);
  });
});

describe('secure conversations', () => {
  it('creates encrypted direct chats once per pair and blocks plaintext inserts', async () => {
    const a = await db.createUser('sc_a');
    const b = await db.createUser('sc_b');
    const c1 = await secureChat(a, 'direct', [b]);
    const c2 = await secureChat(b, 'direct', [a]);
    expect(c2).toBe(c1);
    const [conv] = await db.admin<{ encrypted: boolean; kind: string }>(
      `select encrypted, kind from conversations where id = $1`,
      [c1],
    );
    expect(conv).toEqual({ encrypted: true, kind: 'direct' });
    await expectDenied(
      db.as(
        a,
        `insert into messages (conversation_id, sender_id, body) values ($1, $2, 'plaintext!')`,
        [c1, a.id],
      ),
      // 0011 revokes the insert grant; the 0009 trigger stays as defence in depth.
      /permission denied|conversation_is_encrypted/,
    );
    // Legacy inbox does not list encrypted chats; the secure inbox does.
    expect(await db.as(a, `select * from my_conversations()`)).toEqual([]);
    expect(await db.as(a, `select conversation_id from my_secure_conversations()`)).toEqual([
      { conversation_id: c1 },
    ]);
  });

  it('refuses to create chats with blocked users', async () => {
    const a = await db.createUser('sc_block_a');
    const b = await db.createUser('sc_block_b');
    await db.as(b, `insert into blocks (blocker_id, blocked_id) values ($1, $2)`, [b.id, a.id]);
    await expectDenied(secureChat(a, 'direct', [b]), /cannot_message/);
  });

  it('serializes commits per epoch and only delivers welcomes to member devices', async () => {
    const a = await db.createUser('ep_a');
    const b = await db.createUser('ep_b');
    const outsider = await db.createUser('ep_out');
    const [da, db_, dOut] = [
      await registerDevice(a),
      await registerDevice(b),
      await registerDevice(outsider),
    ];
    const conv = await secureChat(a, 'direct', [b]);

    const seq = await commit(a, conv, da, 0, [
      { device_id: db_, welcome: blob() },
      { device_id: dOut, welcome: blob() }, // not a member → dropped
    ]);
    expect(seq).toBeGreaterThan(0);
    await expectDenied(commit(b, conv, db_, 0), /epoch_conflict/); // epoch 0 already taken
    const [state] = await db.admin<{ mls_epoch: string }>(
      `select mls_epoch from conversations where id = $1`,
      [conv],
    );
    expect(Number(state!.mls_epoch)).toBe(1);

    expect(
      await db.as(b, `select device_id from mls_welcomes where conversation_id = $1`, [conv]),
    ).toEqual([{ device_id: db_ }]);
    expect(await db.as(a, `select * from mls_welcomes where conversation_id = $1`, [conv])).toEqual(
      [],
    );
    expect(await db.admin(`select * from mls_welcomes where device_id = $1`, [dOut])).toEqual([]);
  });

  it('makes commit publishing idempotent for retries', async () => {
    const a = await db.createUser('idem_a');
    const b = await db.createUser('idem_b');
    const da = await registerDevice(a);
    const conv = await secureChat(a, 'direct', [b]);
    const clientId = randomUUID();
    const call = () =>
      db.as<{ seq: string }>(
        a,
        `select public.post_commit($1, $2, 0, $3, $4, '[]'::jsonb) as seq`,
        [conv, da, blob(), clientId],
      );
    const [first] = await call();
    const [second] = await call();
    expect(second!.seq).toBe(first!.seq);
  });

  it('rejects application messages at a stale epoch, from non-members, or from devices you do not own', async () => {
    const a = await db.createUser('msg_a');
    const b = await db.createUser('msg_b');
    const eve = await db.createUser('msg_eve');
    const [da, dbb, de] = [
      await registerDevice(a),
      await registerDevice(b),
      await registerDevice(eve),
    ];
    const conv = await secureChat(a, 'direct', [b]);
    await commit(a, conv, da, 0);

    await expectDenied(sendCipher(a, conv, da, 0), /epoch_stale/);
    const ok = await sendCipher(a, conv, da, 1);
    expect(ok.seq).toBeGreaterThan(0);
    await expectDenied(sendCipher(eve, conv, de, 1), /row-level security/);
    await expectDenied(sendCipher(a, conv, dbb, 1), /row-level security/); // b's device
    await expectDenied(
      db.as(
        a,
        `insert into mls_envelopes (conversation_id, sender_id, sender_device_id, epoch, kind, ciphertext, client_id)
                 values ($1, $2, $3, 1, 'commit', $4, $5)`,
        [conv, a.id, da, blob(), randomUUID()],
      ),
      /row-level security/,
    );
    // Third party can't read ciphertext by guessing the conversation id.
    expect(
      await db.as(eve, `select * from mls_envelopes where conversation_id = $1`, [conv]),
    ).toEqual([]);
    expect(
      await db.as(
        b,
        `select seq from mls_envelopes where conversation_id = $1 and kind = 'application'`,
        [conv],
      ),
    ).toHaveLength(1);
    // Duplicate client id is rejected (idempotent send).
    const cid = randomUUID();
    await sendCipher(a, conv, da, 1, cid);
    await expectDenied(sendCipher(a, conv, da, 1, cid), /duplicate key/);
  });

  it('revoked devices cannot send', async () => {
    const a = await db.createUser('rev_a');
    const b = await db.createUser('rev_b');
    const da = await registerDevice(a);
    const conv = await secureChat(a, 'direct', [b]);
    await commit(a, conv, da, 0);
    await db.as(a, `update devices set revoked_at = now() where id = $1`, [da]);
    await expectDenied(sendCipher(a, conv, da, 1), /row-level security/);
  });

  it('hides envelopes published before a member joined a group', async () => {
    const admin = await db.createUser('grp_admin');
    const m1 = await db.createUser('grp_m1');
    const late = await db.createUser('grp_late');
    const da = await registerDevice(admin);
    const conv = await secureChat(admin, 'group', [m1], 'Design team');
    await commit(admin, conv, da, 0);
    await sendCipher(admin, conv, da, 1);
    await db.as(admin, `select public.add_group_members($1, $2::uuid[])`, [conv, [late.id]]);
    expect(
      await db.as(late, `select * from mls_envelopes where conversation_id = $1`, [conv]),
    ).toEqual([]);
    await commit(admin, conv, da, 1);
    await sendCipher(admin, conv, da, 2);
    expect(
      await db.as(late, `select kind from mls_envelopes where conversation_id = $1 order by seq`, [
        conv,
      ]),
    ).toEqual([{ kind: 'commit' }, { kind: 'application' }]);
  });

  it('enforces group roles for removal, policy and promotion', async () => {
    const admin = await db.createUser('role_admin');
    const m = await db.createUser('role_member');
    const n = await db.createUser('role_member2');
    const conv = await secureChat(admin, 'group', [m, n], 'Roles');
    await expectDenied(
      db.as(m, `select public.remove_group_member($1, $2)`, [conv, n.id]),
      /admins_only/,
    );
    await db.as(m, `select public.remove_group_member($1, $2)`, [conv, m.id]); // leaving is allowed
    expect(await db.as(m, `select * from conversations where id = $1`, [conv])).toEqual([]);
    await db.as(admin, `select public.set_group_policy($1, 'admins')`, [conv]);
    await expectDenied(
      db.as(n, `select public.update_group_info($1, 'Hijacked', null)`, [conv]),
      /admins_only/,
    );
    await db.as(admin, `select public.remove_group_member($1, $2)`, [conv, admin.id]);
    // Last admin left → remaining member promoted automatically.
    const [role] = await db.admin<{ role: string }>(
      `select role from conversation_members where conversation_id = $1 and user_id = $2`,
      [conv, n.id],
    );
    expect(role!.role).toBe('admin');
  });
});

describe('shared themes', () => {
  it('syncs one versioned theme for all members and rejects stale or invalid updates', async () => {
    const a = await db.createUser('th_a');
    const b = await db.createUser('th_b');
    const outsider = await db.createUser('th_out');
    const conv = await secureChat(a, 'direct', [b]);
    const [v1] = await db.as<{ v: number }>(
      a,
      `select public.set_conversation_theme($1, $2::jsonb, 0) as v`,
      [conv, JSON.stringify({ preset: 'aurora', wallpaper: 'nebula' })],
    );
    expect(v1!.v).toBe(1);
    // b sees exactly the same theme (shared, not per-user).
    const [seen] = await db.as<{ theme: unknown; theme_version: number }>(
      b,
      `select theme, theme_version from conversations where id = $1`,
      [conv],
    );
    expect(seen).toEqual({ theme: { preset: 'aurora', wallpaper: 'nebula' }, theme_version: 1 });
    // Concurrent edit based on an old version loses (no update loops / lost writes).
    await expectDenied(
      db.as(b, `select public.set_conversation_theme($1, $2::jsonb, 0)`, [
        conv,
        JSON.stringify({ preset: 'ember' }),
      ]),
      /theme_conflict/,
    );
    await expectDenied(
      db.as(a, `select public.set_conversation_theme($1, $2::jsonb, 1)`, [
        conv,
        JSON.stringify({ preset: 'x', script: '<b>' }),
      ]),
      /invalid_theme/,
    );
    await expectDenied(
      db.as(outsider, `select public.set_conversation_theme($1, $2::jsonb, 1)`, [
        conv,
        JSON.stringify({ preset: 'ember' }),
      ]),
      /not_a_member/,
    );
  });
});

describe('private personalization', () => {
  it('keeps nicknames, mute, tone and pins private to their owner', async () => {
    const a = await db.createUser('pv_a');
    const b = await db.createUser('pv_b');
    const conv = await secureChat(a, 'direct', [b]);
    await db.as(
      a,
      `insert into contact_nicknames (owner_id, contact_id, nickname) values ($1, $2, 'Bestie')`,
      [a.id, b.id],
    );
    await db.as(
      a,
      `insert into conversation_preferences (user_id, conversation_id, muted_until, tone, pinned) values ($1, $2, 'infinity', 'bell', true)`,
      [a.id, conv],
    );
    expect(await db.as(b, `select * from contact_nicknames`)).toEqual([]);
    expect(await db.as(b, `select * from conversation_preferences`)).toEqual([]);
    const [profile] = await db.admin<{ display_name: string }>(
      `select display_name from profiles where id = $1`,
      [b.id],
    );
    expect(profile!.display_name).toBe('pv_b'); // the other person's global name is never changed
    await expectDenied(
      db.as(a, `insert into conversation_preferences (user_id, conversation_id) values ($1, $2)`, [
        b.id,
        conv,
      ]),
      /row-level security/,
    );
    await expectDenied(
      db.as(
        a,
        `insert into conversation_preferences (user_id, conversation_id, tone) values ($1, $2, 'airhorn')`,
        [a.id, conv],
      ),
      /check constraint|duplicate key/,
    );
  });

  it('gates push by global toggle, per-chat toggle and mute expiry — without touching delivery', async () => {
    const a = await db.createUser('push_a');
    const b = await db.createUser('push_b');
    const da = await registerDevice(a);
    const conv = await secureChat(a, 'direct', [b]);
    await commit(a, conv, da, 0);
    const gate = async () =>
      (
        await db.as<{ allowed: boolean; tone: string }>(
          'service',
          `select * from should_push_message($1, $2)`,
          [b.id, conv],
        )
      )[0]!;
    expect(await gate()).toEqual({ allowed: true, tone: 'default' });

    await db.as(
      b,
      `insert into conversation_preferences (user_id, conversation_id, muted_until, tone) values ($1, $2, now() + interval '1 hour', 'pop')`,
      [b.id, conv],
    );
    expect(await gate()).toEqual({ allowed: false, tone: 'pop' });
    await db.admin(
      `update conversation_preferences set muted_until = now() - interval '1 minute' where user_id = $1`,
      [b.id],
    ); // mute expired
    expect((await gate()).allowed).toBe(true);
    await db.as(
      b,
      `update conversation_preferences set notifications_enabled = false where user_id = $1`,
      [b.id],
    );
    expect((await gate()).allowed).toBe(false);
    await db.as(
      b,
      `update conversation_preferences set notifications_enabled = true where user_id = $1`,
      [b.id],
    );
    await db.as(b, `update user_settings set notifications_enabled = false where user_id = $1`, [
      b.id,
    ]);
    expect((await gate()).allowed).toBe(false);

    // Messages are still delivered while notifications are off.
    await sendCipher(a, conv, da, 1);
    expect(
      await db.as(
        b,
        `select seq from mls_envelopes where conversation_id = $1 and kind = 'application'`,
        [conv],
      ),
    ).toHaveLength(1);
    // Notification rows never contain content.
    const notes = await db.admin<{ body: string | null }>(
      `select body from notifications where recipient_id = $1 and type = 'message'`,
      [b.id],
    );
    expect(notes.every((n) => n.body === null)).toBe(true);
    await expectDenied(
      db.as(b, `select * from should_push_message($1, $2)`, [b.id, conv]),
      /permission denied/,
    );
  });

  it('shares read receipts only when enabled, but always syncs private read position', async () => {
    const a = await db.createUser('rr_a');
    const b = await db.createUser('rr_b');
    const da = await registerDevice(a);
    const conv = await secureChat(a, 'direct', [b]);
    await commit(a, conv, da, 0);
    const { seq } = await sendCipher(a, conv, da, 1);
    const [before] = await db.as<{ unread_count: number }>(
      b,
      `select unread_count from my_secure_conversations()`,
    );
    expect(before!.unread_count).toBe(1);

    await db.as(b, `update user_settings set read_receipts = false where user_id = $1`, [b.id]);
    await db.as(b, `select public.ack_conversation($1, $2, $2)`, [conv, seq]);
    const [member] = await db.as<{ read_seq: string; delivered_seq: string }>(
      a,
      `select read_seq, delivered_seq from conversation_members where conversation_id = $1 and user_id = $2`,
      [conv, b.id],
    );
    expect(Number(member!.read_seq)).toBe(0);
    expect(Number(member!.delivered_seq)).toBe(seq);
    const [after] = await db.as<{ unread_count: number }>(
      b,
      `select unread_count from my_secure_conversations()`,
    );
    expect(after!.unread_count).toBe(0);
  });

  it('applies disappearing timers server-side and hides expired ciphertext', async () => {
    const a = await db.createUser('dis_a');
    const b = await db.createUser('dis_b');
    const da = await registerDevice(a);
    const conv = await secureChat(a, 'direct', [b]);
    await commit(a, conv, da, 0);
    await db.as(a, `select public.set_disappearing_messages($1, 3600)`, [conv]);
    const { seq, expiresAt } = await sendCipher(a, conv, da, 1);
    expect(expiresAt).not.toBeNull();
    await db.admin(
      `update mls_envelopes set expires_at = now() - interval '1 second' where seq = $1`,
      [seq],
    );
    expect(await db.as(b, `select * from mls_envelopes where seq = $1`, [seq])).toEqual([]);
    const [purged] = await db.as<{ n: number }>(
      'service',
      `select public.purge_expired_envelopes() as n`,
    );
    expect(purged!.n).toBeGreaterThanOrEqual(1);
    await expectDenied(db.as(a, `select public.purge_expired_envelopes()`), /permission denied/);
  });
});

describe('contact information', () => {
  it('reveals phone numbers only per the owner’s consent setting', async () => {
    const owner = await db.createUser('ph_owner');
    const chat = await db.createUser('ph_chat');
    const stranger = await db.createUser('ph_stranger');
    await secureChat(owner, 'direct', [chat]);
    await db.as(
      owner,
      `insert into contact_methods (user_id, phone_e164, visibility) values ($1, '+14155550123', 'nobody')`,
      [owner.id],
    );
    const phone = (u: User) =>
      db
        .as<{ p: string | null }>(u, `select public.get_contact_phone($1) as p`, [owner.id])
        .then((r) => r[0]!.p);
    expect(await phone(chat)).toBeNull();
    await db.as(owner, `update contact_methods set visibility = 'contacts' where user_id = $1`, [
      owner.id,
    ]);
    expect(await phone(chat)).toBe('+14155550123');
    expect(await phone(stranger)).toBeNull();
    expect(await db.as(stranger, `select * from contact_methods`)).toEqual([]);
    await expectDenied(
      db.as(owner, `update contact_methods set phone_e164 = '555-not-e164' where user_id = $1`, [
        owner.id,
      ]),
      /check constraint/,
    );
  });
});

describe('storage and realtime authorization', () => {
  it('lets only members upload/read encrypted attachments in their own folder', async () => {
    const a = await db.createUser('st_conn_a');
    const b = await db.createUser('st_conn_b');
    const eve = await db.createUser('st_conn_eve');
    const conv = await secureChat(a, 'direct', [b]);
    const path = `${conv}/${a.id}/${randomUUID()}.bin`;
    await db.upload(a, 'connect', path, 'application/octet-stream');
    const q = `select id from storage.objects where bucket_id = 'connect' and name = $1`;
    expect(await db.as(b, q, [path])).toHaveLength(1);
    expect(await db.as(eve, q, [path])).toEqual([]);
    await expectDenied(
      db.upload(eve, 'connect', `${conv}/${eve.id}/x.bin`, 'application/octet-stream'),
      /row-level security/,
    );
    await expectDenied(
      db.upload(b, 'connect', `${conv}/${a.id}/spoof.bin`, 'application/octet-stream'),
      /row-level security/,
    );
  });

  it('restricts typing and presence channels to the right people', async () => {
    const a = await db.createUser('rt_a');
    const b = await db.createUser('rt_b');
    const eve = await db.createUser('rt_eve');
    const conv = await secureChat(a, 'direct', [b]);
    const insertBroadcast = (u: User, topic: string) =>
      db.asOnTopic(u, topic, `insert into realtime.messages (topic, payload) values ($1, '{}')`, [
        topic,
      ]);
    const canRead = async (u: User, topic: string) => {
      await db.admin(`insert into realtime.messages (topic, payload) values ($1, '{}')`, [topic]);
      return (
        (await db.asOnTopic(u, topic, `select id from realtime.messages where topic = $1`, [topic]))
          .length > 0
      );
    };

    expect(await canRead(b, `connect:conv:${conv}`)).toBe(true);
    expect(await canRead(eve, `connect:conv:${conv}`)).toBe(false);
    await insertBroadcast(b, `connect:conv:${conv}`);
    await expectDenied(insertBroadcast(eve, `connect:conv:${conv}`), /row-level security/);

    expect(await canRead(b, `connect:presence:${a.id}`)).toBe(true); // shares a chat
    expect(await canRead(eve, `connect:presence:${a.id}`)).toBe(false);
    await insertBroadcast(a, `connect:presence:${a.id}`);
    await expectDenied(insertBroadcast(b, `connect:presence:${a.id}`), /row-level security/); // can't fake someone's presence
  });
});

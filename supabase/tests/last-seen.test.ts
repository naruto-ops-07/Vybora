import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { expectDenied, TestDb } from './harness/db';

type User = { id: string; username: string };
let db: TestDb;
beforeAll(async () => {
  db = await TestDb.create();
});
afterAll(async () => db.close());

async function chat(owner: User, other: User) {
  await db.as(owner, `select public.create_secure_conversation('direct', $1::uuid[], null)`, [
    [other.id],
  ]);
}
const lastSeen = (viewer: User, ids: string[]) =>
  db.as<{ user_id: string; last_active_at: Date }>(
    viewer,
    `select * from public.last_seen($1::uuid[])`,
    [ids],
  );
const setActive = (u: User, iso: string) =>
  db.admin(
    `insert into user_activity (user_id, last_active_at) values ($1, $2)
     on conflict (user_id) do update set last_active_at = excluded.last_active_at`,
    [u.id, iso],
  );
const showOnline = (u: User, on: boolean) =>
  db.as(u, `update user_settings set show_online = $2 where user_id = $1`, [u.id, on]);

describe('last seen', () => {
  it('returns minute-precision activity only to people who share a chat', async () => {
    const a = await db.createUser('ls_a');
    const b = await db.createUser('ls_b');
    const eve = await db.createUser('ls_eve');
    await chat(a, b);
    await setActive(a, '2026-10-15T10:05:42Z');
    const rows = await lastSeen(b, [a.id]);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.last_active_at.toISOString()).toBe('2026-10-15T10:05:00.000Z');
    expect(await lastSeen(eve, [a.id])).toEqual([]);
  });

  it('returns nothing for someone who was never active', async () => {
    const a = await db.createUser('ls_never_a');
    const b = await db.createUser('ls_never_b');
    await chat(a, b);
    expect(await lastSeen(b, [a.id])).toEqual([]);
  });

  it('hides it when the target turned online status off', async () => {
    const a = await db.createUser('ls_off_a');
    const b = await db.createUser('ls_off_b');
    await chat(a, b);
    await setActive(a, '2026-10-15T10:00:00Z');
    await showOnline(a, false);
    expect(await lastSeen(b, [a.id])).toEqual([]);
  });

  it('is reciprocal: hiding yours hides everyone else’s from you', async () => {
    const a = await db.createUser('ls_rec_a');
    const b = await db.createUser('ls_rec_b');
    await chat(a, b);
    await setActive(a, '2026-10-15T10:00:00Z');
    await showOnline(b, false);
    expect(await lastSeen(b, [a.id])).toEqual([]);
  });

  it('is hidden in both directions after a block', async () => {
    const a = await db.createUser('ls_blk_a');
    const b = await db.createUser('ls_blk_b');
    await chat(a, b);
    await setActive(a, '2026-10-15T10:00:00Z');
    await setActive(b, '2026-10-15T10:00:00Z');
    await db.as(a, `insert into blocks (blocker_id, blocked_id) values ($1, $2)`, [a.id, b.id]);
    expect(await lastSeen(b, [a.id])).toEqual([]);
    expect(await lastSeen(a, [b.id])).toEqual([]);
  });

  it('rejects more than 100 ids and has no direct table access', async () => {
    const a = await db.createUser('ls_lim_a');
    const ids = Array.from({ length: 101 }, () => a.id);
    await expectDenied(lastSeen(a, ids), /too_many_users/);
    await expectDenied(db.as(a, `select * from user_activity`), /permission denied/);
    await expectDenied(
      db.as(a, `insert into user_activity (user_id) values ($1)`, [a.id]),
      /permission denied/,
    );
  });
});

describe('touch_activity', () => {
  it('stamps the caller only, at most once a minute', async () => {
    const a = await db.createUser('ta_a');
    await db.as(a, `select public.touch_activity()`);
    const [first] = await db.admin<{ last_active_at: Date }>(
      `select last_active_at from user_activity where user_id = $1`,
      [a.id],
    );
    expect(first).toBeDefined();

    await db.admin(
      `update user_activity set last_active_at = now() - interval '30 seconds' where user_id = $1`,
      [a.id],
    );
    const [before] = await db.admin<{ last_active_at: Date }>(
      `select last_active_at from user_activity where user_id = $1`,
      [a.id],
    );
    await db.as(a, `select public.touch_activity()`);
    const [throttled] = await db.admin<{ last_active_at: Date }>(
      `select last_active_at from user_activity where user_id = $1`,
      [a.id],
    );
    expect(throttled!.last_active_at.getTime()).toBe(before!.last_active_at.getTime());

    await db.admin(
      `update user_activity set last_active_at = now() - interval '2 minutes' where user_id = $1`,
      [a.id],
    );
    await db.as(a, `select public.touch_activity()`);
    const [fresh] = await db.admin<{ last_active_at: Date }>(
      `select last_active_at from user_activity where user_id = $1`,
      [a.id],
    );
    expect(Date.now() - fresh!.last_active_at.getTime()).toBeLessThan(10_000);

    await expectDenied(db.as('anon', `select public.touch_activity()`));
  });
});

describe('presence channel reciprocity', () => {
  it('stops reading others’ presence when your own online status is off', async () => {
    const a = await db.createUser('pr_a');
    const b = await db.createUser('pr_b');
    await chat(a, b);
    const topic = `connect:presence:${a.id}`;
    await db.admin(`insert into realtime.messages (topic, payload) values ($1, '{}')`, [topic]);
    const canRead = async () =>
      (await db.asOnTopic(b, topic, `select id from realtime.messages where topic = $1`, [topic]))
        .length > 0;
    expect(await canRead()).toBe(true);
    await showOnline(b, false);
    expect(await canRead()).toBe(false);
    // Your own topic stays readable.
    const own = `connect:presence:${b.id}`;
    await db.admin(`insert into realtime.messages (topic, payload) values ($1, '{}')`, [own]);
    expect(
      (await db.asOnTopic(b, own, `select id from realtime.messages where topic = $1`, [own]))
        .length,
    ).toBeGreaterThan(0);
  });
});

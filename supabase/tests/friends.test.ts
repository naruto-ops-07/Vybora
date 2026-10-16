import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { expectDenied, TestDb } from './harness/db';

type User = { id: string; username: string };
let db: TestDb;
beforeAll(async () => {
  db = await TestDb.create();
});
afterAll(async () => db.close());

const send = async (me: User, username: string) =>
  (await db.as<{ r: string }>(me, `select public.send_friend_request($1) as r`, [username]))[0]!.r;
const respond = (me: User, requester: User, accept: boolean) =>
  db.as(me, `select public.respond_friend_request($1, $2)`, [requester.id, accept]);
const friendshipCount = async (a: User, b: User) =>
  (
    await db.admin<{ n: number }>(
      `select count(*)::int as n from friendships
       where user_low = least($1::uuid, $2::uuid) and user_high = greatest($1::uuid, $2::uuid)`,
      [a.id, b.id],
    )
  )[0]!.n;
const requestCount = async (from: User, to: User) =>
  (
    await db.admin<{ n: number }>(
      `select count(*)::int as n from friend_requests where requester_id = $1 and addressee_id = $2`,
      [from.id, to.id],
    )
  )[0]!.n;
const befriend = async (a: User, b: User) => {
  await send(a, b.username);
  await respond(b, a, true);
};
const block = (by: User, target: User) =>
  db.as(by, `insert into blocks (blocker_id, blocked_id) values ($1, $2)`, [by.id, target.id]);

describe('send_friend_request', () => {
  it('matches the exact username ignoring case, spaces and one leading @', async () => {
    const a = await db.createUser('fr_send_a');
    const b = await db.createUser('fr_send_b');
    expect(await send(a, '  @FR_Send_B ')).toBe('sent');
    expect(await requestCount(a, b)).toBe(1);
  });

  it('answers unknown, inactive and blocked usernames with the same error', async () => {
    const a = await db.createUser('fr_nf_a');
    const inactive = await db.createUser('fr_nf_inactive');
    const blockedMe = await db.createUser('fr_nf_blocker');
    const iBlocked = await db.createUser('fr_nf_blocked');
    await db.admin(`update profiles set status = 'suspended' where id = $1`, [inactive.id]);
    await block(blockedMe, a);
    await block(a, iBlocked);
    for (const name of ['fr_nf_nobody', inactive.username, blockedMe.username, iBlocked.username]) {
      await expectDenied(send(a, name), /user_not_found/);
    }
    expect(await requestCount(a, blockedMe)).toBe(0);
    expect(await requestCount(a, iBlocked)).toBe(0);
  });

  it('refuses to add yourself', async () => {
    const a = await db.createUser('fr_self');
    await expectDenied(send(a, 'fr_self'), /cannot_add_self/);
  });

  it('is idempotent for a pending request and for existing friends', async () => {
    const a = await db.createUser('fr_dup_a');
    const b = await db.createUser('fr_dup_b');
    expect(await send(a, b.username)).toBe('sent');
    expect(await send(a, b.username)).toBe('already_sent');
    expect(await requestCount(a, b)).toBe(1);
    await respond(b, a, true);
    expect(await send(a, b.username)).toBe('already_friends');
    expect(await send(b, a.username)).toBe('already_friends');
  });

  it('turns a reverse pending request into a friendship', async () => {
    const a = await db.createUser('fr_rev_a');
    const b = await db.createUser('fr_rev_b');
    expect(await send(a, b.username)).toBe('sent');
    expect(await send(b, a.username)).toBe('accepted');
    expect(await friendshipCount(a, b)).toBe(1);
    expect(await requestCount(a, b)).toBe(0);
    expect(await requestCount(b, a)).toBe(0);
  });

  it('caps pending outgoing requests at 100', async () => {
    const a = await db.createUser('fr_cap_a');
    await db.admin(
      `insert into auth.users (email, raw_user_meta_data)
       select 'cap' || g || '@test.vybora.dev', jsonb_build_object('username', 'fr_cap_t' || g)
       from generate_series(1, 101) g`,
    );
    await db.admin(
      `insert into friend_requests (requester_id, addressee_id)
       select $1, id from profiles where username ~ '^fr_cap_t' and username <> 'fr_cap_t101'`,
      [a.id],
    );
    expect(
      (await db.admin(`select 1 from friend_requests where requester_id = $1`, [a.id])).length,
    ).toBe(100);
    await expectDenied(send(a, 'fr_cap_t101'), /too_many_requests/);
    // Already-pending targets still answer idempotently.
    expect(await send(a, 'fr_cap_t1')).toBe('already_sent');
  });

  it('is denied to anon', async () => {
    await expectDenied(
      db.as('anon', `select public.send_friend_request('x')`),
      /permission denied/,
    );
  });
});

describe('respond / cancel / remove', () => {
  it('denies anon on every friend RPC', async () => {
    const id = '00000000-0000-0000-0000-000000000001';
    for (const call of [
      `select public.respond_friend_request('${id}', true)`,
      `select public.cancel_friend_request('${id}')`,
      `select public.remove_friend('${id}')`,
      `select public.are_friends('${id}')`,
    ]) {
      await expectDenied(db.as('anon', call), /permission denied/);
    }
  });

  it('accepting also clears a reverse pending request', async () => {
    const a = await db.createUser('fr_race_a');
    const b = await db.createUser('fr_race_b');
    await send(a, b.username);
    // Simulate the race where both requests were inserted before either was seen.
    await db.admin(`insert into friend_requests (requester_id, addressee_id) values ($1, $2)`, [
      b.id,
      a.id,
    ]);
    await respond(b, a, true);
    expect(await friendshipCount(a, b)).toBe(1);
    expect(await requestCount(a, b)).toBe(0);
    expect(await requestCount(b, a)).toBe(0);
  });

  it('refuses to accept across a block, exactly like a missing request', async () => {
    const a = await db.createUser('fr_bacc_a');
    const b = await db.createUser('fr_bacc_b');
    await block(b, a);
    await db.admin(`insert into friend_requests (requester_id, addressee_id) values ($1, $2)`, [
      a.id,
      b.id,
    ]);
    await expectDenied(respond(b, a, true), /request_not_found/);
    expect(await friendshipCount(a, b)).toBe(0);
    await db.admin(`delete from blocks`);
  });

  it('accepting creates one ordered friendship and clears the request', async () => {
    const a = await db.createUser('fr_acc_a');
    const b = await db.createUser('fr_acc_b');
    await send(a, b.username);
    await respond(b, a, true);
    expect(await friendshipCount(a, b)).toBe(1);
    expect(await requestCount(a, b)).toBe(0);
    const areFriends = async (me: User, other: User) =>
      (await db.as<{ ok: boolean }>(me, `select public.are_friends($1) as ok`, [other.id]))[0]!.ok;
    expect(await areFriends(a, b)).toBe(true);
    expect(await areFriends(b, a)).toBe(true);
  });

  it('declining deletes the request without a friendship', async () => {
    const a = await db.createUser('fr_dec_a');
    const b = await db.createUser('fr_dec_b');
    await send(a, b.username);
    await respond(b, a, false);
    expect(await friendshipCount(a, b)).toBe(0);
    expect(await requestCount(a, b)).toBe(0);
  });

  it('only the addressee can respond, and only to an existing request', async () => {
    const a = await db.createUser('fr_who_a');
    const b = await db.createUser('fr_who_b');
    const eve = await db.createUser('fr_who_eve');
    await send(a, b.username);
    await expectDenied(respond(eve, a, true), /request_not_found/);
    await expectDenied(respond(a, b, true), /request_not_found/);
    expect(await friendshipCount(a, b)).toBe(0);
    expect(await requestCount(a, b)).toBe(1);
  });

  it('cancel removes only my own pending request; remove deletes the friendship', async () => {
    const a = await db.createUser('fr_can_a');
    const b = await db.createUser('fr_can_b');
    await send(a, b.username);
    await db.as(b, `select public.cancel_friend_request($1)`, [a.id]);
    expect(await requestCount(a, b)).toBe(1);
    await db.as(a, `select public.cancel_friend_request($1)`, [b.id]);
    expect(await requestCount(a, b)).toBe(0);
    await db.as(a, `select public.cancel_friend_request($1)`, [b.id]);

    await befriend(a, b);
    const eve = await db.createUser('fr_can_eve');
    await db.as(eve, `select public.remove_friend($1)`, [a.id]);
    expect(await friendshipCount(a, b)).toBe(1);
    await db.as(b, `select public.remove_friend($1)`, [a.id]);
    expect(await friendshipCount(a, b)).toBe(0);
    await db.as(b, `select public.remove_friend($1)`, [a.id]);
  });
});

describe('listing', () => {
  it('lists friends and requests for the caller only, hiding inactive profiles', async () => {
    const me = await db.createUser('fr_list_me', { displayName: 'Zed' });
    const f1 = await db.createUser('fr_list_f1', { displayName: 'Bea' });
    const f2 = await db.createUser('fr_list_f2', { displayName: 'Amy' });
    const gone = await db.createUser('fr_list_gone');
    const inReq = await db.createUser('fr_list_in');
    const outReq = await db.createUser('fr_list_out');
    await befriend(me, f1);
    await befriend(f2, me);
    await befriend(me, gone);
    await db.admin(`update profiles set status = 'suspended' where id = $1`, [gone.id]);
    await send(inReq, me.username);
    await send(me, outReq.username);

    const friends = await db.as<{ user_id: string; username: string; display_name: string }>(
      me,
      `select * from public.my_friends()`,
    );
    expect(friends.map((f) => f.username)).toEqual(['fr_list_f2', 'fr_list_f1']);

    const reqs = await db.as<{ direction: string; user_id: string }>(
      me,
      `select * from public.my_friend_requests()`,
    );
    expect(reqs.map((r) => `${r.direction}:${r.user_id}`).sort()).toEqual(
      [`incoming:${inReq.id}`, `outgoing:${outReq.id}`].sort(),
    );

    expect(await db.as(inReq, `select * from public.my_friends()`)).toEqual([]);
    await expectDenied(db.as('anon', `select * from public.my_friends()`), /permission denied/);
    await expectDenied(
      db.as('anon', `select * from public.my_friend_requests()`),
      /permission denied/,
    );
  });
});

describe('listing and blocks', () => {
  it('hides blocked pairs from both lists even if rows linger', async () => {
    const me = await db.createUser('fr_lb_me');
    const friend = await db.createUser('fr_lb_friend');
    const asker = await db.createUser('fr_lb_asker');
    const asked = await db.createUser('fr_lb_asked');
    await befriend(me, friend);
    await send(asker, me.username);
    await send(me, asked.username);
    await db.admin(`insert into blocks (blocker_id, blocked_id) values ($1, $2), ($3, $4)`, [
      me.id,
      friend.id,
      asker.id,
      me.id,
    ]);
    await db.admin(`insert into blocks (blocker_id, blocked_id) values ($1, $2)`, [
      asked.id,
      me.id,
    ]);
    // Re-create rows the cleanup trigger removed, as a racing write could.
    await db.admin(
      `insert into friendships (user_low, user_high) values (least($1::uuid, $2::uuid), greatest($1::uuid, $2::uuid))`,
      [me.id, friend.id],
    );
    await db.admin(
      `insert into friend_requests (requester_id, addressee_id) values ($1, $2), ($2, $3)`,
      [asker.id, me.id, asked.id],
    );
    expect(await db.as(me, `select * from public.my_friends()`)).toEqual([]);
    expect(await db.as(me, `select * from public.my_friend_requests()`)).toEqual([]);
  });

  it('raises not_authenticated from are_friends without a user', async () => {
    await expectDenied(
      db.as('service', `select public.are_friends(gen_random_uuid())`),
      /not_authenticated/,
    );
  });
});

describe('table access', () => {
  it('has no direct client access to the friend tables', async () => {
    const a = await db.createUser('fr_tbl_a');
    const b = await db.createUser('fr_tbl_b');
    for (const table of ['friend_requests', 'friendships']) {
      await expectDenied(db.as(a, `select * from ${table}`), /permission denied/);
      await expectDenied(db.as('anon', `select * from ${table}`), /permission denied/);
    }
    await expectDenied(
      db.as(a, `insert into friend_requests (requester_id, addressee_id) values ($1, $2)`, [
        a.id,
        b.id,
      ]),
      /permission denied/,
    );
    const [low, high] = a.id < b.id ? [a, b] : [b, a];
    await expectDenied(
      db.as(a, `insert into friendships (user_low, user_high) values ($1, $2)`, [low.id, high.id]),
      /permission denied/,
    );
  });
});

describe('blocking', () => {
  it('removes the friendship and pending requests in both directions', async () => {
    const a = await db.createUser('fr_blk_a');
    const b = await db.createUser('fr_blk_b');
    const c = await db.createUser('fr_blk_c');
    const d = await db.createUser('fr_blk_d');
    await befriend(a, b);
    await send(a, c.username);
    await send(d, a.username);
    await block(a, b);
    await block(c, a);
    await block(a, d);
    const e = await db.createUser('fr_blk_e');
    await send(a, e.username);
    await block(a, e);
    expect(await requestCount(a, e)).toBe(0);
    expect(await friendshipCount(a, b)).toBe(0);
    expect(await requestCount(a, c)).toBe(0);
    expect(await requestCount(d, a)).toBe(0);
  });
});

describe('friends-only message privacy', () => {
  const setPrivacy = (u: User, value: string) =>
    db.as(u, `update user_settings set message_privacy = $2 where user_id = $1`, [u.id, value]);
  const direct = (me: User, other: User) =>
    db.as(me, `select public.create_secure_conversation('direct', $1::uuid[], null)`, [[other.id]]);

  it('accepts the new value and rejects unknown ones', async () => {
    const a = await db.createUser('fr_pv_val');
    await setPrivacy(a, 'friends');
    await expectDenied(setPrivacy(a, 'nobody'), /check constraint|violates/);
  });

  it('lets only friends start a chat', async () => {
    const owner = await db.createUser('fr_pv_owner');
    const friend = await db.createUser('fr_pv_friend');
    const stranger = await db.createUser('fr_pv_stranger');
    await befriend(owner, friend);
    await setPrivacy(owner, 'friends');
    await expectDenied(direct(stranger, owner), /cannot_message/);
    expect(await direct(friend, owner)).toHaveLength(1);
  });

  it('does not admit people the recipient follows under friends-only', async () => {
    const owner = await db.createUser('fr_pv_fo_owner');
    const followed = await db.createUser('fr_pv_fo_followed');
    await db.admin(
      `insert into follows (follower_id, following_id, status) values ($1, $2, 'accepted')`,
      [owner.id, followed.id],
    );
    expect(await direct(followed, owner)).toHaveLength(1);
    await db.admin(`delete from conversations`);
    await setPrivacy(owner, 'friends');
    await expectDenied(direct(followed, owner), /cannot_message/);
  });

  it('leaves everyone and following unchanged', async () => {
    const owner = await db.createUser('fr_pv_o2');
    const stranger = await db.createUser('fr_pv_s2');
    expect(await direct(stranger, owner)).toHaveLength(1);

    const owner3 = await db.createUser('fr_pv_o3');
    const follower = await db.createUser('fr_pv_f3');
    const friendOnly = await db.createUser('fr_pv_g3');
    await setPrivacy(owner3, 'following');
    await db.admin(
      `insert into follows (follower_id, following_id, status) values ($1, $2, 'accepted')`,
      [owner3.id, follower.id],
    );
    await befriend(owner3, friendOnly);
    await expectDenied(direct(friendOnly, owner3), /cannot_message/);
    expect(await direct(follower, owner3)).toHaveLength(1);
  });
});

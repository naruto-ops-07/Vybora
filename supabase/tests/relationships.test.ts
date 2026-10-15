import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { expectDenied, TestDb } from './harness/db';
import { createPost, follow } from './harness/fixtures';

let db: TestDb;
beforeAll(async () => {
  db = await TestDb.create();
});
afterAll(async () => db.close());

describe('profiles', () => {
  it('lets a user edit their own profile but not someone else’s', async () => {
    const alice = await db.createUser('alice');
    const bob = await db.createUser('bob');

    await db.as(alice, `update profiles set bio = 'hello' where id = $1`, [alice.id]);
    // RLS silently filters the target row → 0 rows updated, data unchanged.
    await db.as(alice, `update profiles set bio = 'pwned' where id = $1`, [bob.id]);
    const [b] = await db.admin<{ bio: string }>(`select bio from profiles where id = $1`, [bob.id]);
    const [a] = await db.admin<{ bio: string }>(`select bio from profiles where id = $1`, [
      alice.id,
    ]);
    expect(a!.bio).toBe('hello');
    expect(b!.bio).toBe('');
  });

  it('forbids clients from forging counters or account status', async () => {
    const carol = await db.createUser('carol');
    await expectDenied(
      db.as(carol, `update profiles set followers_count = 1000000 where id = $1`, [carol.id]),
      /permission denied/,
    );
    await expectDenied(
      db.as(carol, `update profiles set status = 'active' where id = $1`, [carol.id]),
      /permission denied/,
    );
  });

  it('rejects avatar paths outside the owner folder', async () => {
    const dave = await db.createUser('dave');
    const erin = await db.createUser('erin');
    await expectDenied(
      db.as(dave, `update profiles set avatar_path = $2 where id = $1`, [
        dave.id,
        `${erin.id}/a.jpg`,
      ]),
      /avatar_path_not_owned/,
    );
  });

  it('prevents ordinary users from granting themselves admin', async () => {
    const mallory = await db.createUser('mallory');
    await expectDenied(
      db.as(mallory, `insert into user_roles (user_id, role) values ($1, 'admin')`, [mallory.id]),
      /permission denied/,
    );
    await expectDenied(
      db.as(mallory, `select public.admin_set_role($1, 'admin', true)`, [mallory.id]),
      /forbidden/,
    );
    const roles = await db.admin(`select * from user_roles where user_id = $1`, [mallory.id]);
    expect(roles).toEqual([]);
  });
});

describe('follows', () => {
  it('follows a public account immediately and maintains counts', async () => {
    const f1 = await db.createUser('fan_one');
    const star = await db.createUser('public_star');
    await follow(db, f1, star);
    const [edge] = await db.admin<{ status: string }>(
      `select status from follows where follower_id = $1 and following_id = $2`,
      [f1.id, star.id],
    );
    expect(edge!.status).toBe('accepted');
    const [p] = await db.admin<{ followers_count: number }>(
      `select followers_count from profiles where id = $1`,
      [star.id],
    );
    expect(p!.followers_count).toBe(1);

    await db.as(f1, `delete from follows where follower_id = $1 and following_id = $2`, [
      f1.id,
      star.id,
    ]);
    const [p2] = await db.admin<{ followers_count: number }>(
      `select followers_count from profiles where id = $1`,
      [star.id],
    );
    expect(p2!.followers_count).toBe(0);
  });

  it('creates a pending request for private accounts even if the client asks for accepted', async () => {
    const fan = await db.createUser('hopeful');
    const priv = await db.createUser('very_private', { private: true });
    await db.as(fan, `insert into follows (follower_id, following_id) values ($1, $2)`, [
      fan.id,
      priv.id,
    ]);
    const [edge] = await db.admin<{ status: string }>(
      `select status from follows where follower_id = $1 and following_id = $2`,
      [fan.id, priv.id],
    );
    expect(edge!.status).toBe('pending');

    // The requester cannot accept their own request.
    await db.as(
      fan,
      `update follows set status = 'accepted' where follower_id = $1 and following_id = $2`,
      [fan.id, priv.id],
    );
    const [still] = await db.admin<{ status: string }>(
      `select status from follows where follower_id = $1 and following_id = $2`,
      [fan.id, priv.id],
    );
    expect(still!.status).toBe('pending');

    // The private account accepts → notification + counts.
    await db.as(
      priv,
      `update follows set status = 'accepted' where follower_id = $1 and following_id = $2`,
      [fan.id, priv.id],
    );
    const [p] = await db.admin<{ followers_count: number }>(
      `select followers_count from profiles where id = $1`,
      [priv.id],
    );
    expect(p!.followers_count).toBe(1);
    const notes = await db.admin<{ type: string }>(
      `select type from notifications where recipient_id = $1`,
      [fan.id],
    );
    expect(notes.map((n) => n.type)).toContain('follow_accept');
  });

  it('prevents following on behalf of someone else and self-follows', async () => {
    const x = await db.createUser('xavier');
    const y = await db.createUser('yolanda');
    const z = await db.createUser('zane');
    await expectDenied(
      db.as(x, `insert into follows (follower_id, following_id) values ($1, $2)`, [y.id, z.id]),
      /row-level security/,
    );
    await expectDenied(
      db.as(x, `insert into follows (follower_id, following_id) values ($1, $1)`, [x.id]),
      /check constraint|violates/,
    );
  });

  it('rejects duplicate relationships', async () => {
    const a = await db.createUser('dup_a');
    const b = await db.createUser('dup_b');
    await follow(db, a, b);
    await expectDenied(follow(db, a, b), /duplicate key/);
  });
});

describe('privacy', () => {
  it('hides private account content from anonymous users and non-followers', async () => {
    const owner = await db.createUser('secret_owner', { private: true });
    const follower = await db.createUser('trusted_friend');
    const stranger = await db.createUser('stranger_danger');
    const postId = await createPost(db, owner, { caption: 'private moment' });

    await follow(db, follower, owner);
    await db.as(
      owner,
      `update follows set status = 'accepted' where follower_id = $1 and following_id = $2`,
      [follower.id, owner.id],
    );

    expect(await db.as('anon', `select id from posts where id = $1`, [postId])).toEqual([]);
    expect(await db.as(stranger, `select id from posts where id = $1`, [postId])).toEqual([]);
    expect(await db.as(stranger, `select id from post_media where post_id = $1`, [postId])).toEqual(
      [],
    );
    expect(await db.as(follower, `select id from posts where id = $1`, [postId])).toHaveLength(1);
    expect(await db.as(owner, `select id from get_post($1)`, [postId])).toHaveLength(1);

    // Profile row itself is discoverable, but get_profile says content is locked.
    const [prof] = await db.as<{ can_view_content: boolean }>(
      stranger,
      `select * from get_profile('secret_owner')`,
    );
    expect(prof!.can_view_content).toBe(false);
    // Follower lists of a private account are hidden from strangers.
    expect(
      await db.as(stranger, `select * from list_follows($1, 'followers')`, [owner.id]),
    ).toEqual([]);
    expect(
      await db.as(follower, `select * from list_follows($1, 'followers')`, [owner.id]),
    ).toHaveLength(1);
  });

  it('approves pending requests when an account becomes public', async () => {
    const owner = await db.createUser('going_public', { private: true });
    const fan = await db.createUser('patient_fan');
    await follow(db, fan, owner);
    await db.as(owner, `update profiles set is_private = false where id = $1`, [owner.id]);
    const [edge] = await db.admin<{ status: string }>(
      `select status from follows where follower_id = $1 and following_id = $2`,
      [fan.id, owner.id],
    );
    expect(edge!.status).toBe('accepted');
  });
});

describe('blocks and mutes', () => {
  it('blocking severs follows, hides content and prevents interaction', async () => {
    const blocker = await db.createUser('blocker');
    const pest = await db.createUser('pest');
    await follow(db, pest, blocker);
    await follow(db, blocker, pest);
    const postId = await createPost(db, blocker, { caption: 'no pests allowed' });

    await db.as(blocker, `insert into blocks (blocker_id, blocked_id) values ($1, $2)`, [
      blocker.id,
      pest.id,
    ]);

    const edges = await db.admin(
      `select * from follows where $1 in (follower_id, following_id) and $2 in (follower_id, following_id)`,
      [blocker.id, pest.id],
    );
    expect(edges).toEqual([]);
    expect(await db.as(pest, `select id from posts where id = $1`, [postId])).toEqual([]);
    expect(await db.as(pest, `select id from profiles where id = $1`, [blocker.id])).toEqual([]);
    await expectDenied(follow(db, pest, blocker), /blocked/);
    await expectDenied(
      db.as(pest, `insert into likes (user_id, post_id) values ($1, $2)`, [pest.id, postId]),
      /row-level security/,
    );
    // The blocked user cannot see the block row; the blocker can.
    expect(await db.as(pest, `select * from blocks`)).toEqual([]);
    expect(await db.as(blocker, `select * from blocks`)).toHaveLength(1);
    // Search excludes the blocker for the blocked user.
    expect(await db.as(pest, `select * from search_profiles('blocker')`)).toEqual([]);
  });

  it('muting removes posts from the home feed without unfollowing', async () => {
    const reader = await db.createUser('reader');
    const loud = await db.createUser('loud_poster');
    await follow(db, reader, loud);
    await createPost(db, loud, { caption: 'post 1' });
    expect(await db.as(reader, `select id from feed_home()`)).toHaveLength(1);
    await db.as(reader, `insert into mutes (muter_id, muted_id) values ($1, $2)`, [
      reader.id,
      loud.id,
    ]);
    expect(await db.as(reader, `select id from feed_home()`)).toHaveLength(0);
    const edges = await db.admin(`select * from follows where follower_id = $1`, [reader.id]);
    expect(edges).toHaveLength(1);
  });
});

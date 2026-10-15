import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { expectDenied, TestDb } from './harness/db';
import { createPost, follow } from './harness/fixtures';

let db: TestDb;
beforeAll(async () => {
  db = await TestDb.create();
});
afterAll(async () => db.close());

describe('posts', () => {
  it('creates a post atomically with media, hashtags and author counts', async () => {
    const maya = await db.createUser('maya');
    const id = await createPost(db, maya, { caption: 'Golden hour #Sunset #travel' });
    const [card] = await db.as<{ media: unknown[]; author: { username: string } }>(
      maya,
      `select * from get_post($1)`,
      [id],
    );
    expect(card!.media).toHaveLength(1);
    expect(card!.author.username).toBe('maya');
    const tags = await db.admin<{ tag: string; post_count: number }>(
      `select tag, post_count from hashtags order by tag`,
    );
    expect(tags).toEqual([
      { tag: 'sunset', post_count: 1 },
      { tag: 'travel', post_count: 1 },
    ]);
    const [p] = await db.admin<{ posts_count: number }>(
      `select posts_count from profiles where id = $1`,
      [maya.id],
    );
    expect(p!.posts_count).toBe(1);
  });

  it('refuses posts without media (no orphan post rows)', async () => {
    const u = await db.createUser('no_media');
    await expectDenied(
      db.as(u, `select public.create_post('hi', '[]'::jsonb)`),
      /post_requires_media/,
    );
    await expectDenied(
      db.as(u, `insert into posts (author_id, caption) values ($1, 'bare')`, [u.id]),
      /post_requires_media/,
    );
    expect(await db.admin(`select * from posts where author_id = $1`, [u.id])).toEqual([]);
  });

  it('refuses media that was never uploaded or belongs to someone else', async () => {
    const thief = await db.createUser('thief');
    const victim = await db.createUser('victim');
    const victimPath = `${victim.id}/${randomUUID()}.jpg`;
    await db.upload(victim, 'media', victimPath, 'image/jpeg');
    const media = (p: string) =>
      JSON.stringify([{ storage_path: p, media_type: 'image', mime_type: 'image/jpeg' }]);
    await expectDenied(
      db.as(thief, `select public.create_post('x', $1::jsonb)`, [media(victimPath)]),
      /media_path_not_owned/,
    );
    await expectDenied(
      db.as(thief, `select public.create_post('x', $1::jsonb)`, [media(`${thief.id}/missing.jpg`)]),
      /media_not_uploaded/,
    );
    expect(await db.admin(`select * from posts where author_id = $1`, [thief.id])).toEqual([]);
  });

  it('rejects a declared MIME type that differs from the stored object', async () => {
    const u = await db.createUser('sneaky_mime');
    const path = `${u.id}/${randomUUID()}.jpg`;
    await db.upload(u, 'media', path, 'video/mp4');
    await expectDenied(
      db.as(u, `select public.create_post('x', $1::jsonb)`, [
        JSON.stringify([{ storage_path: path, media_type: 'image', mime_type: 'image/jpeg' }]),
      ]),
      /media_type_mismatch/,
    );
  });

  it('requires reels to contain exactly one video', async () => {
    const u = await db.createUser('reel_maker');
    await expectDenied(
      createPost(db, u, { kind: 'reel', mime: 'image/jpeg' }),
      /reel_requires_single_video/,
    );
    const id = await createPost(db, u, { kind: 'reel' });
    expect(await db.as(u, `select id from feed_reels()`)).toEqual([{ id }]);
  });

  it('lets only the author edit or delete a post', async () => {
    const owner = await db.createUser('post_owner');
    const other = await db.createUser('post_other');
    const id = await createPost(db, owner, { caption: 'original' });

    await db.as(other, `update posts set caption = 'hacked' where id = $1`, [id]);
    await db.as(other, `delete from posts where id = $1`, [id]);
    const [row] = await db.admin<{ caption: string }>(`select caption from posts where id = $1`, [
      id,
    ]);
    expect(row!.caption).toBe('original');

    await expectDenied(
      db.as(owner, `update posts set like_count = 999 where id = $1`, [id]),
      /permission denied/,
    );
    await db.as(owner, `update posts set caption = 'edited #newtag' where id = $1`, [id]);
    const [edited] = await db.admin<{ caption: string }>(
      `select caption from posts where id = $1`,
      [id],
    );
    expect(edited!.caption).toBe('edited #newtag');

    await db.as(owner, `delete from posts where id = $1`, [id]);
    expect(await db.admin(`select * from posts where id = $1`, [id])).toEqual([]);
    // Media cleanup is queued for the trusted worker.
    const queued = await db.admin(
      `select * from private.media_deletion_queue where reason = 'post_deleted'`,
    );
    expect(queued.length).toBeGreaterThan(0);
  });
});

describe('likes, comments, saves', () => {
  it('likes are idempotent per user, counted server-side and notify the author once', async () => {
    const author = await db.createUser('liked_author');
    const fan = await db.createUser('liker');
    const id = await createPost(db, author);

    await db.as(fan, `insert into likes (user_id, post_id) values ($1, $2)`, [fan.id, id]);
    await expectDenied(
      db.as(fan, `insert into likes (user_id, post_id) values ($1, $2)`, [fan.id, id]),
      /duplicate key/,
    );
    const [p] = await db.admin<{ like_count: number }>(
      `select like_count from posts where id = $1`,
      [id],
    );
    expect(p!.like_count).toBe(1);
    const notes = await db.admin(
      `select * from notifications where recipient_id = $1 and type = 'like'`,
      [author.id],
    );
    expect(notes).toHaveLength(1);

    const [card] = await db.as<{ liked_by_me: boolean }>(
      fan,
      `select liked_by_me from get_post($1)`,
      [id],
    );
    expect(card!.liked_by_me).toBe(true);

    await db.as(fan, `delete from likes where user_id = $1 and post_id = $2`, [fan.id, id]);
    const [p2] = await db.admin<{ like_count: number }>(
      `select like_count from posts where id = $1`,
      [id],
    );
    expect(p2!.like_count).toBe(0);
  });

  it('cannot like on behalf of another user', async () => {
    const author = await db.createUser('like_target');
    const a = await db.createUser('like_forger');
    const b = await db.createUser('like_victim');
    const id = await createPost(db, author);
    await expectDenied(
      db.as(a, `insert into likes (user_id, post_id) values ($1, $2)`, [b.id, id]),
      /row-level security/,
    );
  });

  it('supports comments, single-level replies, and respects disabled comments', async () => {
    const author = await db.createUser('thread_author');
    const c1 = await db.createUser('commenter');
    const id = await createPost(db, author);
    const [top] = await db.as<{ id: string }>(
      c1,
      `insert into comments (post_id, author_id, body) values ($1, $2, '  first!  ') returning id`,
      [id, c1.id],
    );
    const [reply] = await db.as<{ id: string }>(
      author,
      `insert into comments (post_id, author_id, parent_id, body) values ($1, $2, $3, 'thanks @commenter') returning id`,
      [id, author.id, top!.id],
    );
    // reply-to-reply flattens to the top-level thread
    const [nested] = await db.as<{ parent_id: string }>(
      c1,
      `insert into comments (post_id, author_id, parent_id, body) values ($1, $2, $3, 'np') returning parent_id`,
      [id, c1.id, reply!.id],
    );
    expect(nested!.parent_id).toBe(top!.id);

    const threads = await db.as<{ body: string; reply_count: number }>(
      c1,
      `select * from list_comments($1)`,
      [id],
    );
    expect(threads).toEqual([expect.objectContaining({ body: 'first!', reply_count: 2 })]);
    const [p] = await db.admin<{ comment_count: number }>(
      `select comment_count from posts where id = $1`,
      [id],
    );
    expect(p!.comment_count).toBe(3);

    const types = (
      await db.admin<{ type: string }>(`select type from notifications where recipient_id = $1`, [
        c1.id,
      ])
    ).map((n) => n.type);
    expect(types).toEqual(expect.arrayContaining(['reply', 'mention']));

    await db.as(author, `update posts set comments_enabled = false where id = $1`, [id]);
    await expectDenied(
      db.as(c1, `insert into comments (post_id, author_id, body) values ($1, $2, 'more')`, [
        id,
        c1.id,
      ]),
      /comments_disabled/,
    );
  });

  it('allows comment deletion by the comment author or the post owner only', async () => {
    const author = await db.createUser('owner_mod');
    const c = await db.createUser('comment_writer');
    const rando = await db.createUser('rando');
    const id = await createPost(db, author);
    const insert = async () =>
      (
        await db.as<{ id: string }>(
          c,
          `insert into comments (post_id, author_id, body) values ($1, $2, 'x') returning id`,
          [id, c.id],
        )
      )[0]!.id;

    const c1 = await insert();
    await db.as(rando, `delete from comments where id = $1`, [c1]);
    expect(await db.admin(`select id from comments where id = $1`, [c1])).toHaveLength(1);
    await db.as(author, `delete from comments where id = $1`, [c1]);
    expect(await db.admin(`select id from comments where id = $1`, [c1])).toHaveLength(0);
    const c2 = await insert();
    await db.as(c, `delete from comments where id = $1`, [c2]);
    expect(await db.admin(`select id from comments where id = $1`, [c2])).toHaveLength(0);
  });

  it('keeps saved collections private', async () => {
    const author = await db.createUser('save_author');
    const saver = await db.createUser('saver');
    const snoop = await db.createUser('snoop');
    const id = await createPost(db, author);
    await db.as(saver, `insert into saved_posts (user_id, post_id) values ($1, $2)`, [
      saver.id,
      id,
    ]);
    expect(await db.as(saver, `select id from feed_saved()`)).toEqual([{ id }]);
    expect(await db.as(snoop, `select * from saved_posts where user_id = $1`, [saver.id])).toEqual(
      [],
    );
  });
});

describe('feeds', () => {
  it('home feed paginates by cursor without duplicates and only includes followed authors', async () => {
    const reader = await db.createUser('feed_reader');
    const followed = await db.createUser('feed_followed');
    const unfollowed = await db.createUser('feed_unfollowed');
    await follow(db, reader, followed);
    const ids: string[] = [];
    for (let i = 0; i < 5; i++) ids.push(await createPost(db, followed, { caption: `p${i}` }));
    await createPost(db, unfollowed, { caption: 'not for you' });

    const page1 = await db.as<{ id: string; created_at: Date }>(
      reader,
      `select id, created_at from feed_home(null, null, 3)`,
    );
    expect(page1).toHaveLength(3);
    const last = page1[2]!;
    const page2 = await db.as<{ id: string }>(reader, `select id from feed_home($1, $2, 3)`, [
      last.created_at,
      last.id,
    ]);
    expect(page2).toHaveLength(2);
    const all = [...page1.map((r) => r.id), ...page2.map((r) => r.id)];
    expect(new Set(all).size).toBe(5);
    expect(all.sort()).toEqual([...ids].sort());
  });

  it('explore only surfaces public accounts and ranks trending by engagement', async () => {
    const viewer = await db.createUser('explorer');
    const pub = await db.createUser('explore_public');
    const priv = await db.createUser('explore_private', { private: true });
    const quiet = await createPost(db, pub, { caption: 'quiet' });
    const hot = await createPost(db, pub, { caption: 'hot' });
    await createPost(db, priv, { caption: 'hidden' });
    await db.as(viewer, `insert into likes (user_id, post_id) values ($1, $2)`, [viewer.id, hot]);

    const trending = await db.as<{ id: string }>(viewer, `select id from feed_explore('trending')`);
    const ids = trending.map((r) => r.id);
    expect(ids.indexOf(hot)).toBeLessThan(ids.indexOf(quiet));
    const authors = await db.as<{ author_is_private: boolean }>(
      viewer,
      `select author_is_private from feed_explore('latest')`,
    );
    expect(authors.every((a) => !a.author_is_private)).toBe(true);
  });

  it('anonymous visitors can read public post cards but no saved/like state', async () => {
    const u = await db.createUser('anon_visible');
    const id = await createPost(db, u, { caption: 'hello world' });
    const [card] = await db.as<{ liked_by_me: boolean; saved_by_me: boolean }>(
      'anon',
      `select * from get_post($1)`,
      [id],
    );
    expect(card).toMatchObject({ liked_by_me: false, saved_by_me: false });
    expect(await db.as('anon', `select * from saved_posts`)).toEqual([]);
    await expectDenied(
      db.as('anon', `insert into likes (user_id, post_id) values ($1, $2)`, [u.id, id]),
      /permission denied/,
    );
  });

  it('hashtag feed and search', async () => {
    const u = await db.createUser('tagger');
    const id = await createPost(db, u, { caption: 'Coffee time #latteart' });
    expect(await db.as('anon', `select id from feed_hashtag('#LatteArt')`)).toEqual([{ id }]);
    const tags = await db.as<{ tag: string }>(u, `select tag from search_hashtags('latte')`);
    expect(tags.map((t) => t.tag)).toContain('latteart');
  });
});

describe('rate limiting', () => {
  it('throttles comment floods at the database boundary', async () => {
    const author = await db.createUser('flood_target');
    const spammer = await db.createUser('spammer');
    const id = await createPost(db, author);
    for (let i = 0; i < 20; i++) {
      await db.as(spammer, `insert into comments (post_id, author_id, body) values ($1, $2, $3)`, [
        id,
        spammer.id,
        `spam ${i}`,
      ]);
    }
    await expectDenied(
      db.as(
        spammer,
        `insert into comments (post_id, author_id, body) values ($1, $2, 'one more')`,
        [id, spammer.id],
      ),
      /rate_limit_exceeded/,
    );
  });
});

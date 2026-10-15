import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { expectDenied, TestDb } from './harness/db';
import { createStory, follow, startConversation } from './harness/fixtures';

let db: TestDb;
beforeAll(async () => {
  // Legacy DMs are exercised under the schema that still allowed sending; the
  // final suite applies the read-only migration (0011) on top of that data.
  db = await TestDb.create('20261010000010');
});
afterAll(async () => db.close());

describe('stories', () => {
  it('server sets expiry regardless of client input', async () => {
    const u = await db.createUser('storyteller');
    const path = `${u.id}/${randomUUID()}.jpg`;
    await db.upload(u, 'media', path, 'image/jpeg');
    const [row] = await db.as<{ hours: number }>(
      u,
      `insert into stories (author_id, storage_path, media_type, mime_type)
       values ($1, $2, 'image', 'image/jpeg')
       returning round(extract(epoch from (expires_at - created_at)) / 3600) as hours`,
      [u.id, path],
    );
    expect(Number(row!.hours)).toBe(24);
    await expectDenied(
      db.as(
        u,
        `insert into stories (author_id, storage_path, media_type, mime_type, expires_at) values ($1, $2, 'image', 'image/jpeg', now() + interval '30 days')`,
        [u.id, `${u.id}/x.jpg`],
      ),
      /permission denied/,
    );
  });

  it('expired stories are inaccessible through normal queries and their media is unreadable', async () => {
    const author = await db.createUser('fading_author');
    const fan = await db.createUser('fading_fan');
    await follow(db, fan, author);
    const story = await createStory(db, author);
    expect(await db.as(fan, `select id from stories where id = $1`, [story.id])).toHaveLength(1);
    expect(
      await db.as(fan, `select id from storage.objects where name = $1`, [story.path]),
    ).toHaveLength(1);
    expect(await db.as(fan, `select author_id from story_tray()`)).toEqual([
      { author_id: author.id },
    ]);

    await db.admin(
      `update stories set created_at = now() - interval '25 hours', expires_at = now() - interval '1 hour' where id = $1`,
      [story.id],
    );
    expect(await db.as(fan, `select id from stories where id = $1`, [story.id])).toEqual([]);
    expect(
      await db.as(fan, `select id from storage.objects where name = $1`, [story.path]),
    ).toEqual([]);
    expect(await db.as(fan, `select * from story_tray()`)).toEqual([]);
  });

  it('records views only for visible stories and shows viewer lists only to the author', async () => {
    const author = await db.createUser('viewed_author');
    const fan = await db.createUser('viewer_fan');
    const other = await db.createUser('viewer_other');
    await follow(db, fan, author);
    const story = await createStory(db, author);

    await db.as(fan, `insert into story_views (story_id, viewer_id) values ($1, $2)`, [
      story.id,
      fan.id,
    ]);
    await expectDenied(
      db.as(fan, `insert into story_views (story_id, viewer_id) values ($1, $2)`, [
        story.id,
        other.id,
      ]),
      /row-level security/,
    );
    expect(await db.as(author, `select viewer_id from story_viewers($1)`, [story.id])).toEqual([
      { viewer_id: fan.id },
    ]);
    expect(await db.as(other, `select * from story_viewers($1)`, [story.id])).toEqual([]);
    expect(await db.as(other, `select * from story_views where story_id = $1`, [story.id])).toEqual(
      [],
    );
  });

  it('purge is service-role only and keeps active stories', async () => {
    const u = await db.createUser('purge_user');
    const active = await createStory(db, u);
    const old = await createStory(db, u);
    await db.admin(
      `update stories set created_at = now() - interval '30 hours', expires_at = now() - interval '6 hours' where id = $1`,
      [old.id],
    );

    await expectDenied(db.as(u, `select public.purge_expired_stories()`), /permission denied/);
    const [res] = await db.as<{ n: number }>(
      'service',
      `select public.purge_expired_stories() as n`,
    );
    expect(res!.n).toBeGreaterThanOrEqual(1);
    expect(await db.admin(`select id from stories where id = $1`, [active.id])).toHaveLength(1);
    expect(await db.admin(`select id from stories where id = $1`, [old.id])).toHaveLength(0);
    expect(
      await db.admin(`select * from private.media_deletion_queue where object_path = $1`, [
        old.path,
      ]),
    ).toHaveLength(1);
  });
});

describe('direct messages', () => {
  it('members can message; non-members cannot read by guessing the conversation id', async () => {
    const a = await db.createUser('dm_alice');
    const b = await db.createUser('dm_bob');
    const eve = await db.createUser('dm_eve');
    const conv = await startConversation(db, a, b);
    // Idempotent: starting again returns the same conversation.
    expect(await startConversation(db, b, a)).toBe(conv);

    await db.as(
      a,
      `insert into messages (conversation_id, sender_id, body) values ($1, $2, 'hey bob')`,
      [conv, a.id],
    );
    expect(await db.as(b, `select body from messages where conversation_id = $1`, [conv])).toEqual([
      { body: 'hey bob' },
    ]);

    expect(await db.as(eve, `select * from messages where conversation_id = $1`, [conv])).toEqual(
      [],
    );
    expect(await db.as(eve, `select * from conversations where id = $1`, [conv])).toEqual([]);
    expect(
      await db.as(eve, `select * from conversation_members where conversation_id = $1`, [conv]),
    ).toEqual([]);
    await expectDenied(
      db.as(
        eve,
        `insert into messages (conversation_id, sender_id, body) values ($1, $2, 'let me in')`,
        [conv, eve.id],
      ),
      /row-level security/,
    );
  });

  it('users cannot add themselves to conversations', async () => {
    const a = await db.createUser('m_a');
    const b = await db.createUser('m_b');
    const intruder = await db.createUser('m_intruder');
    const conv = await startConversation(db, a, b);
    await expectDenied(
      db.as(
        intruder,
        `insert into conversation_members (conversation_id, user_id) values ($1, $2)`,
        [conv, intruder.id],
      ),
      /permission denied/,
    );
    await expectDenied(
      db.as(intruder, `insert into conversations (kind) values ('direct')`),
      /permission denied/,
    );
  });

  it('tracks unread counts and read state', async () => {
    const a = await db.createUser('u_a');
    const b = await db.createUser('u_b');
    const conv = await startConversation(db, a, b);
    for (const text of ['one', 'two']) {
      await db.as(
        a,
        `insert into messages (conversation_id, sender_id, body) values ($1, $2, $3)`,
        [conv, a.id, text],
      );
    }
    const [inbox] = await db.as<{
      unread_count: number;
      other_username: string;
      last_message_body: string;
    }>(b, `select * from my_conversations()`);
    expect(inbox).toMatchObject({
      unread_count: 2,
      other_username: 'u_a',
      last_message_body: 'two',
    });
    // one coalesced message notification
    const notes = await db.admin(
      `select * from notifications where recipient_id = $1 and type = 'message' and read_at is null`,
      [b.id],
    );
    expect(notes).toHaveLength(1);

    await db.as(b, `select public.mark_conversation_read($1)`, [conv]);
    const [after] = await db.as<{ unread_count: number }>(
      b,
      `select unread_count from my_conversations()`,
    );
    expect(after!.unread_count).toBe(0);
    const [counts] = await db.as<{ conversations: number }>(b, `select * from unread_counts()`);
    expect(counts!.conversations).toBe(0);
  });

  it('idempotency key prevents duplicate sends on retry', async () => {
    const a = await db.createUser('retry_a');
    const b = await db.createUser('retry_b');
    const conv = await startConversation(db, a, b);
    const clientId = randomUUID();
    const send = () =>
      db.as(
        a,
        `insert into messages (conversation_id, sender_id, body, client_id) values ($1, $2, 'once', $3)`,
        [conv, a.id, clientId],
      );
    await send();
    await expectDenied(send(), /duplicate key/);
  });

  it('blocks prevent starting conversations and sending messages', async () => {
    const a = await db.createUser('blk_a');
    const b = await db.createUser('blk_b');
    const conv = await startConversation(db, a, b);
    await db.as(b, `insert into blocks (blocker_id, blocked_id) values ($1, $2)`, [b.id, a.id]);
    await expectDenied(
      db.as(
        a,
        `insert into messages (conversation_id, sender_id, body) values ($1, $2, 'hello?')`,
        [conv, a.id],
      ),
      /cannot_message/,
    );
    const c = await db.createUser('blk_c');
    await db.as(c, `insert into blocks (blocker_id, blocked_id) values ($1, $2)`, [c.id, a.id]);
    await expectDenied(startConversation(db, a, c), /cannot_message/);
  });

  it('respects "people I follow" message privacy', async () => {
    const a = await db.createUser('priv_sender');
    const b = await db.createUser('priv_recipient');
    await db.as(b, `update user_settings set message_privacy = 'following' where user_id = $1`, [
      b.id,
    ]);
    await expectDenied(startConversation(db, a, b), /recipient_restricts_messages/);
    await follow(db, b, a);
    expect(await startConversation(db, a, b)).toBeTruthy();
  });

  it('attachments: only members can upload into or read a conversation folder', async () => {
    const a = await db.createUser('att_a');
    const b = await db.createUser('att_b');
    const eve = await db.createUser('att_eve');
    const conv = await startConversation(db, a, b);
    const path = `${conv}/${a.id}/${randomUUID()}.png`;
    await db.upload(a, 'dm', path, 'image/png');
    await db.as(
      a,
      `insert into messages (conversation_id, sender_id, attachment_path, attachment_mime) values ($1, $2, $3, 'image/png')`,
      [conv, a.id, path],
    );
    expect(
      await db.as(b, `select id from storage.objects where bucket_id = 'dm' and name = $1`, [path]),
    ).toHaveLength(1);
    expect(
      await db.as(eve, `select id from storage.objects where bucket_id = 'dm' and name = $1`, [
        path,
      ]),
    ).toEqual([]);
    await expectDenied(
      db.upload(eve, 'dm', `${conv}/${eve.id}/x.png`, 'image/png'),
      /row-level security/,
    );
    // Members cannot upload into another member's sub-folder.
    await expectDenied(
      db.upload(b, 'dm', `${conv}/${a.id}/spoof.png`, 'image/png'),
      /row-level security/,
    );
  });
});

describe('notifications', () => {
  it('are readable and updatable only by their recipient and cannot be forged', async () => {
    const a = await db.createUser('note_a');
    const b = await db.createUser('note_b');
    await follow(db, a, b);
    const [note] = await db.admin<{ id: string }>(
      `select id from notifications where recipient_id = $1`,
      [b.id],
    );
    expect(await db.as(a, `select * from notifications where id = $1`, [note!.id])).toEqual([]);
    await db.as(a, `update notifications set read_at = now() where id = $1`, [note!.id]);
    const [still] = await db.admin<{ read_at: Date | null }>(
      `select read_at from notifications where id = $1`,
      [note!.id],
    );
    expect(still!.read_at).toBeNull();
    await expectDenied(
      db.as(a, `insert into notifications (recipient_id, actor_id, type) values ($1, $2, 'like')`, [
        b.id,
        a.id,
      ]),
      /permission denied/,
    );
    await db.as(b, `select public.mark_all_notifications_read()`);
    const [read] = await db.admin<{ read_at: Date | null }>(
      `select read_at from notifications where id = $1`,
      [note!.id],
    );
    expect(read!.read_at).not.toBeNull();
  });

  it('device tokens are private to their owner', async () => {
    const a = await db.createUser('tok_a');
    const b = await db.createUser('tok_b');
    await db.as(
      a,
      `insert into device_tokens (token, platform) values ('ExponentPushToken[aaaaaaaaaa]', 'ios')`,
    );
    expect(await db.as(b, `select * from device_tokens`)).toEqual([]);
    expect(await db.as(a, `select platform from device_tokens`)).toEqual([{ platform: 'ios' }]);
  });
});

describe('legacy direct messages after the read-only migration (0011)', () => {
  it('keeps history readable and unsendable, but blocks any new plaintext', async () => {
    const a = await db.createUser('ro_alice');
    const b = await db.createUser('ro_bob');
    const conv = await startConversation(db, a, b);
    const [msg] = await db.as<{ id: string }>(
      a,
      `insert into messages (conversation_id, sender_id, body) values ($1, $2, 'before') returning id`,
      [conv, a.id],
    );

    await db.applyRemainingMigrations();

    // Existing history stays readable to members only.
    expect(await db.as(b, `select body from messages where conversation_id = $1`, [conv])).toEqual([
      { body: 'before' },
    ]);
    // No new plaintext messages or conversations.
    await expectDenied(
      db.as(a, `insert into messages (conversation_id, sender_id, body) values ($1, $2, 'after')`, [
        conv,
        a.id,
      ]),
      /permission denied/,
    );
    const c = await db.createUser('ro_carol');
    await expectDenied(startConversation(db, a, c), /permission denied/);
    // Senders can still unsend their own old messages.
    await db.as(a, `delete from messages where id = $1`, [msg!.id]);
    expect(await db.admin(`select id from messages where id = $1`, [msg!.id])).toEqual([]);
  });
});

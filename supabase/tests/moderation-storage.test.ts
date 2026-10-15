import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { expectDenied, TestDb } from './harness/db';
import { createPost, startConversation } from './harness/fixtures';

let db: TestDb;
let admin: { id: string; username: string };
let moderator: { id: string; username: string };

beforeAll(async () => {
  // Starts before the legacy-DM lock (0011) so a legacy message can be seeded.
  db = await TestDb.create('20261010000010');
  admin = await db.createUser('site_admin');
  moderator = await db.createUser('site_mod');
  await db.admin(`insert into user_roles (user_id, role) values ($1, 'admin'), ($2, 'moderator')`, [
    admin.id,
    moderator.id,
  ]);
});
afterAll(async () => db.close());

describe('reports', () => {
  it('users file reports; only staff can see the queue', async () => {
    const author = await db.createUser('reported_author');
    const reporter = await db.createUser('reporter');
    const bystander = await db.createUser('bystander');
    const post = await createPost(db, author);
    await db.as(
      reporter,
      `insert into reports (reporter_id, target_type, target_id, reason) values ($1, 'post', $2, 'spam')`,
      [reporter.id, post],
    );
    // Duplicate open report is rejected.
    await expectDenied(
      db.as(
        reporter,
        `insert into reports (reporter_id, target_type, target_id, reason) values ($1, 'post', $2, 'spam')`,
        [reporter.id, post],
      ),
      /duplicate key/,
    );
    expect(await db.as(bystander, `select * from reports`)).toEqual([]);
    expect(await db.as(reporter, `select * from reports`)).toHaveLength(1);
    expect((await db.as(moderator, `select * from reports`)).length).toBeGreaterThanOrEqual(1);
    // Reporters cannot self-resolve.
    await expectDenied(
      db.as(reporter, `update reports set status = 'dismissed'`),
      /permission denied/,
    );
  });
});

describe('moderation actions', () => {
  it('moderators can remove and restore posts; actions are audited', async () => {
    const author = await db.createUser('bad_poster');
    const post = await createPost(db, author);
    const [report] = await db.as<{ id: string }>(
      admin,
      `insert into reports (reporter_id, target_type, target_id, reason) values ($1, 'post', $2, 'hate') returning id`,
      [admin.id, post],
    );
    await db.as(moderator, `select public.mod_remove_post($1, 'hate speech', $2)`, [
      post,
      report!.id,
    ]);

    const viewer = await db.createUser('post_viewer');
    expect(await db.as(viewer, `select id from posts where id = $1`, [post])).toEqual([]);
    expect(await db.as(moderator, `select id from posts where id = $1`, [post])).toHaveLength(1);
    const [r] = await db.admin<{ status: string }>(`select status from reports where id = $1`, [
      report!.id,
    ]);
    expect(r!.status).toBe('actioned');
    const [counts] = await db.admin<{ posts_count: number }>(
      `select posts_count from profiles where id = $1`,
      [author.id],
    );
    expect(counts!.posts_count).toBe(0);
    expect(
      await db.admin(
        `select * from moderation_actions where target_id = $1 and action = 'remove_post'`,
        [post],
      ),
    ).toHaveLength(1);
    expect(await db.admin(`select * from audit_logs where entity_id = $1`, [post])).toHaveLength(1);
    expect(
      await db.admin(
        `select * from notifications where recipient_id = $1 and type = 'moderation'`,
        [author.id],
      ),
    ).toHaveLength(1);

    await db.as(moderator, `select public.mod_restore_post($1, 'appeal accepted')`, [post]);
    expect(await db.as(viewer, `select id from posts where id = $1`, [post])).toHaveLength(1);
  });

  it('regular users cannot invoke moderation or admin functions', async () => {
    const user = await db.createUser('wannabe_mod');
    const target = await db.createUser('wannabe_target');
    const post = await createPost(db, target);
    await expectDenied(db.as(user, `select public.mod_remove_post($1, 'x')`, [post]), /forbidden/);
    await expectDenied(db.as(user, `select * from public.admin_overview()`), /forbidden/);
    await expectDenied(db.as(user, `select * from public.admin_search_users('')`), /forbidden/);
    await expectDenied(
      db.as(user, `select public.admin_set_user_status($1, 'suspended', 'x')`, [target.id]),
      /forbidden/,
    );
    await expectDenied(db.as('anon', `select * from public.admin_overview()`), /permission denied/);
    expect(await db.as(user, `select * from moderation_actions`)).toEqual([]);
    expect(await db.as(user, `select * from audit_logs`)).toEqual([]);
  });

  it('only admins (not moderators) can suspend accounts or manage roles', async () => {
    const target = await db.createUser('to_suspend');
    await expectDenied(
      db.as(moderator, `select public.admin_set_user_status($1, 'suspended', 'x')`, [target.id]),
      /forbidden/,
    );
    await expectDenied(
      db.as(moderator, `select public.admin_set_role($1, 'moderator', true)`, [target.id]),
      /forbidden/,
    );

    await db.as(admin, `select public.admin_set_user_status($1, 'suspended', 'spam ring')`, [
      target.id,
    ]);
    // Suspended accounts cannot create content and are hidden from others.
    const path = `${target.id}/${randomUUID()}.jpg`;
    await expectDenied(db.upload(target, 'media', path, 'image/jpeg'), /row-level security/);
    const someone = await db.createUser('someone_else');
    expect(await db.as(someone, `select id from profiles where id = $1`, [target.id])).toEqual([]);

    await expectDenied(
      db.as(admin, `select public.admin_set_role($1, 'admin', false)`, [admin.id]),
      /cannot_revoke_own_admin/,
    );
  });

  it('staff cannot read private messages', async () => {
    const a = await db.createUser('dm_private_a');
    const b = await db.createUser('dm_private_b');
    const conv = await startConversation(db, a, b);
    await db.as(
      a,
      `insert into messages (conversation_id, sender_id, body) values ($1, $2, 'secret')`,
      [conv, a.id],
    );
    // Legacy DMs were created before the read-only migration; check against the current schema.
    await db.applyRemainingMigrations();
    expect(await db.as(admin, `select * from messages where conversation_id = $1`, [conv])).toEqual(
      [],
    );
    expect(
      await db.as(moderator, `select * from messages where conversation_id = $1`, [conv]),
    ).toEqual([]);
  });

  it('admin overview returns real counts', async () => {
    const [o] = await db.as<{ total_users: number; open_reports: number }>(
      admin,
      `select * from admin_overview()`,
    );
    const [{ n }] = (await db.admin<{ n: number }>(`select count(*)::int as n from profiles`)) as [
      { n: number },
    ];
    expect(o!.total_users).toBe(n);
  });
});

describe('storage', () => {
  it('users can only upload into their own folder', async () => {
    const a = await db.createUser('st_a');
    const b = await db.createUser('st_b');
    await db.upload(a, 'media', `${a.id}/ok.jpg`, 'image/jpeg');
    await expectDenied(
      db.upload(a, 'media', `${b.id}/evil.jpg`, 'image/jpeg'),
      /row-level security/,
    );
    await expectDenied(
      db.upload(a, 'avatars', `${b.id}/evil.jpg`, 'image/jpeg'),
      /row-level security/,
    );
    await expectDenied(
      db.upload('anon', 'media', `anon/x.jpg`, 'image/jpeg'),
      /row-level security/,
    );
  });

  it('private-account media cannot be fetched by strangers or anonymous users', async () => {
    const owner = await db.createUser('st_private', { private: true });
    const stranger = await db.createUser('st_stranger');
    await createPost(db, owner);
    const [m] = await db.admin<{ storage_path: string }>(
      `select storage_path from post_media m join posts p on p.id = m.post_id where p.author_id = $1`,
      [owner.id],
    );
    const q = `select id from storage.objects where bucket_id = 'media' and name = $1`;
    expect(await db.as(owner, q, [m!.storage_path])).toHaveLength(1);
    expect(await db.as(stranger, q, [m!.storage_path])).toEqual([]);
    expect(await db.as('anon', q, [m!.storage_path])).toEqual([]);
  });

  it('public post media is readable anonymously (needed for signed URLs on public pages)', async () => {
    const pub = await db.createUser('st_public');
    await createPost(db, pub);
    const [m] = await db.admin<{ storage_path: string }>(
      `select storage_path from post_media m join posts p on p.id = m.post_id where p.author_id = $1`,
      [pub.id],
    );
    expect(
      await db.as('anon', `select id from storage.objects where name = $1`, [m!.storage_path]),
    ).toHaveLength(1);
  });

  it('users cannot delete other users’ objects', async () => {
    const a = await db.createUser('del_a');
    const b = await db.createUser('del_b');
    const path = `${a.id}/${randomUUID()}.jpg`;
    await db.upload(a, 'media', path, 'image/jpeg');
    await db.as(b, `delete from storage.objects where name = $1`, [path]);
    expect(await db.admin(`select id from storage.objects where name = $1`, [path])).toHaveLength(
      1,
    );
  });
});

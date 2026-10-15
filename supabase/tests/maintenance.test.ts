import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { expectDenied, TestDb } from './harness/db';
import { createPost } from './harness/fixtures';

let db: TestDb;
beforeAll(async () => {
  db = await TestDb.create();
});
afterAll(async () => db.close());

describe('maintenance RPCs', () => {
  it('are callable only by the service role', async () => {
    const u = await db.createUser('maint_user');
    await expectDenied(
      db.as(u, `select * from public.claim_media_deletions()`),
      /permission denied/,
    );
    await expectDenied(
      db.as('anon', `select * from public.find_orphan_media()`),
      /permission denied/,
    );
  });

  it('claims queued deletions exactly once', async () => {
    const u = await db.createUser('maint_poster');
    const id = await createPost(db, u);
    await db.as(u, `delete from posts where id = $1`, [id]);
    const first = await db.as<{ object_path: string }>(
      'service',
      `select * from public.claim_media_deletions(100)`,
    );
    expect(first.length).toBeGreaterThan(0);
    const second = await db.as('service', `select * from public.claim_media_deletions(100)`);
    expect(second).toEqual([]);
  });

  it('finds only old, unreferenced uploads', async () => {
    const u = await db.createUser('maint_orphan');
    const orphan = `${u.id}/${randomUUID()}.jpg`;
    const fresh = `${u.id}/${randomUUID()}.jpg`;
    await db.upload(u, 'media', orphan, 'image/jpeg');
    await db.upload(u, 'media', fresh, 'image/jpeg');
    await createPost(db, u); // referenced object
    await db.admin(
      `update storage.objects set created_at = now() - interval '2 days' where name like $1`,
      [`${u.id}/%`],
    );
    await db.admin(`update storage.objects set created_at = now() where name = $1`, [fresh]);

    const rows = await db.as<{ name: string }>(
      'service',
      `select name from public.find_orphan_media('24 hours', 100)`,
    );
    const names = rows.map((r) => r.name);
    expect(names).toContain(orphan);
    expect(names).not.toContain(fresh);
    const referenced = await db.admin<{ storage_path: string }>(
      `select storage_path from post_media m join posts p on p.id = m.post_id where p.author_id = $1`,
      [u.id],
    );
    expect(names).not.toContain(referenced[0]!.storage_path);
  });
});

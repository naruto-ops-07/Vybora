import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { TestDb } from './harness/db';

let db: TestDb;

beforeAll(async () => {
  db = await TestDb.create();
});
afterAll(async () => db.close());

describe('schema', () => {
  it('applies every migration cleanly', async () => {
    const tables = await db.admin<{ table_name: string }>(
      `select table_name from information_schema.tables where table_schema = 'public' and table_type = 'BASE TABLE' order by 1`,
    );
    expect(tables.map((t) => t.table_name)).toEqual(
      [
        'audit_logs',
        'blocks',
        'comments',
        'contact_methods',
        'contact_nicknames',
        'conversation_members',
        'conversation_preferences',
        'conversations',
        'device_tokens',
        'devices',
        'follows',
        'hashtags',
        'key_packages',
        'likes',
        'messages',
        'mls_envelopes',
        'mls_welcomes',
        'moderation_actions',
        'mutes',
        'notifications',
        'post_hashtags',
        'post_media',
        'posts',
        'profiles',
        'reports',
        'saved_posts',
        'stories',
        'story_views',
        'user_activity',
        'user_roles',
        'user_settings',
      ].sort(),
    );
  });

  it('enables RLS on every public table', async () => {
    const rows = await db.admin<{ relname: string }>(
      `select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity`,
    );
    expect(rows).toEqual([]);
  });

  it('does not expose the private schema to API roles', async () => {
    const rows = await db.admin<{ anon: boolean; auth: boolean }>(
      `select has_schema_privilege('anon', 'private', 'usage') as anon,
              has_schema_privilege('authenticated', 'private', 'usage') as auth`,
    );
    expect(rows[0]).toEqual({ anon: false, auth: false });
  });

  it('creates a profile and settings for each new auth user', async () => {
    const u = await db.createUser('first.user');
    const [profile] = await db.admin(
      `select username, status, posts_count from profiles where id = $1`,
      [u.id],
    );
    expect(profile).toEqual({ username: 'first.user', status: 'active', posts_count: 0 });
    const settings = await db.admin(
      `select message_privacy from user_settings where user_id = $1`,
      [u.id],
    );
    expect(settings).toHaveLength(1);
  });

  it('falls back to a generated username when the requested one is invalid, reserved or taken', async () => {
    const a = await db.createUser('admin');
    const b = await db.createUser('first.user');
    const rows = await db.admin<{ username: string }>(
      `select username from profiles where id in ($1, $2)`,
      [a.id, b.id],
    );
    for (const r of rows) expect(r.username).toMatch(/^user_[0-9a-f]{10}$/);
  });

  it('reports username availability to anonymous visitors', async () => {
    const [taken] = await db.as<{ ok: boolean }>(
      'anon',
      `select public.username_available('first.user') as ok`,
    );
    const [free] = await db.as<{ ok: boolean }>(
      'anon',
      `select public.username_available('brand.new') as ok`,
    );
    const [bad] = await db.as<{ ok: boolean }>(
      'anon',
      `select public.username_available('a..b') as ok`,
    );
    expect([taken!.ok, free!.ok, bad!.ok]).toEqual([false, true, false]);
  });

  it('registers messages and notifications for realtime', async () => {
    const rows = await db.admin<{ tablename: string }>(
      `select tablename from pg_publication_tables where pubname = 'supabase_realtime' order by 1`,
    );
    expect(rows.map((r) => r.tablename)).toEqual([
      'conversation_members',
      'conversations',
      'messages',
      'mls_envelopes',
      'mls_welcomes',
      'notifications',
    ]);
  });
});

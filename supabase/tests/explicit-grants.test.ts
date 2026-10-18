import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { applyMigrations, bootDatabase, migrationFiles } from './harness/boot.mjs';
import { expectDenied, TestDb } from './harness/db';
import {
  API_ROLES,
  describePrivilege,
  diffPrivileges,
  readAllPrivileges,
  readClientPrivileges,
  readEffectivePrivileges,
  renderGrantStatements,
  type Privilege,
} from './harness/grants.mjs';

// Newer hosted Supabase projects don't install the old default privileges, so
// every privilege a migration needs must be granted explicitly. These tests
// boot the schema both ways ('defaults' = the shim's old Supabase defaults,
// 'strict' = none) and require the API roles to end up identical.

const GRANTS_MIGRATION = '20261018000014_explicit_client_grants.sql';
const LAST_BEFORE_GRANTS = '20261016000013';
const grantsFile = () => {
  const file = migrationFiles().find((f) => f.endsWith(GRANTS_MIGRATION));
  if (!file) throw new Error(`supabase/migrations/${GRANTS_MIGRATION} is missing`);
  return file;
};

let defaults: TestDb;
let strict: TestDb;
beforeAll(async () => {
  defaults = await TestDb.create(undefined, { grants: 'defaults' });
  strict = await TestDb.create(undefined, { grants: 'strict' });
});
afterAll(async () => {
  await defaults?.close();
  await strict?.close();
});

const LIST_LIMIT = 60;
const bullets = (lines: string[]) =>
  [
    ...lines.slice(0, LIST_LIMIT).map((l) => `  ${l}`),
    ...(lines.length > LIST_LIMIT ? [`  … and ${lines.length - LIST_LIMIT} more`] : []),
  ].join('\n');
const roleOnObject = (p: Privilege) => `${p.kind} ${p.object} ${p.role}`;

async function driftMessage(expected: Privilege[], missing: Privilege[], extra: Privilege[]) {
  const parts: string[] = [];
  if (missing.length) {
    // Re-grant each affected role's full set on the object: idempotent, and it
    // lets the renderer say `all` where the role holds everything.
    const affected = new Set(missing.map(roleOnObject));
    const fix = renderGrantStatements(
      expected.filter((p) => affected.has(roleOnObject(p))),
      await readAllPrivileges(defaults.pg),
    );
    parts.push(
      `${missing.length} privilege(s) exist only because of Supabase's old default privileges; ` +
        'a hosted project without them (strict mode) does not have them:',
      bullets(missing.map(describePrivilege)),
      'Fix: add an explicit grant in your migration (only if it has not been applied anywhere ' +
        'yet), or regenerate the 0014 grants into a NEW migration:',
      '  pnpm db:grants supabase/migrations/<timestamp>_explicit_client_grants.sql',
      'Never edit an applied migration. The missing grants:',
      bullets(fix.map((s) => s.sql)),
    );
  }
  if (extra.length) {
    parts.push(
      `${extra.length} privilege(s) are granted in strict mode but not in the default-privileges ` +
        'state, so a migration widens access beyond what the suite tests:',
      bullets(extra.map(describePrivilege)),
      'Grant only what the tested state has (or revoke it in a new migration).',
    );
  }
  return parts.join('\n');
}

function diffLines(expected: string[], actual: string[]) {
  const a = new Set(actual);
  const e = new Set(expected);
  return {
    missing: expected.filter((x) => !a.has(x)),
    extra: actual.filter((x) => !e.has(x)),
  };
}

describe('drift guard: explicit grants', () => {
  it('grants explicitly every privilege the migrations would get from default privileges', async () => {
    const expected = await readClientPrivileges(defaults.pg);
    const actual = await readClientPrivileges(strict.pg);
    expect(expected.length).toBeGreaterThan(0);
    const { missing, extra } = diffPrivileges(expected, actual);
    if (missing.length || extra.length) {
      throw new Error(await driftMessage(expected, missing, extra));
    }
  });

  it('gives anon, authenticated and service_role the same effective access in both modes', async () => {
    // Counts grants to PUBLIC and column access implied by table grants, too.
    const { missing, extra } = diffLines(
      await readEffectivePrivileges(defaults.pg),
      await readEffectivePrivileges(strict.pg),
    );
    if (missing.length || extra.length) {
      throw new Error(
        'Effective access differs without default privileges.\n' +
          `Missing in strict mode (${missing.length}):\n${bullets(missing)}\n` +
          `Extra in strict mode (${extra.length}):\n${bullets(extra)}`,
      );
    }
  });

  it(`${GRANTS_MIGRATION} reproduces the tested state of the migrations before it, nothing more`, async () => {
    const reference = await bootDatabase({ mode: 'defaults', upTo: LAST_BEFORE_GRANTS });
    const withGrants = await bootDatabase({ mode: 'strict', upTo: LAST_BEFORE_GRANTS });
    try {
      await applyMigrations(withGrants, [grantsFile()]);
      const { missing, extra } = diffPrivileges(
        await readClientPrivileges(reference),
        await readClientPrivileges(withGrants),
      );
      expect({
        missing: missing.map(describePrivilege),
        extra: extra.map(describePrivilege),
      }).toEqual({ missing: [], extra: [] });
    } finally {
      await reference.close();
      await withGrants.close();
    }
  });

  it(`${GRANTS_MIGRATION} only grants, and only to the API roles`, () => {
    const statements = readFileSync(grantsFile(), 'utf8')
      .split('\n')
      .filter((line) => !line.trimStart().startsWith('--'))
      .join('\n')
      .split(';')
      .map((s) => s.trim().replace(/\s+/g, ' '))
      .filter(Boolean);
    expect(statements.length).toBeGreaterThan(0);
    const offending = statements.filter((s) => {
      const grantees = /^grant .+ to ([a-z_, ]+?)( with grant option)?$/i.exec(s)?.[1];
      return !grantees || grantees.split(/, */).some((r) => !API_ROLES.includes(r));
    });
    expect(offending).toEqual([]);
  });
});

// RPCs the web/mobile apps call as a signed-in user (packages/api, apps/*).
const CLIENT_RPCS = [
  'ack_conversation',
  'add_group_members',
  'admin_overview',
  'admin_search_users',
  'admin_set_role',
  'admin_set_user_status',
  'cancel_friend_request',
  'claim_key_packages',
  'create_post',
  'create_secure_conversation',
  'feed_explore',
  'feed_hashtag',
  'feed_home',
  'feed_profile',
  'feed_reels',
  'feed_saved',
  'get_contact_phone',
  'get_post',
  'get_profile',
  'last_seen',
  'list_comments',
  'list_follow_requests',
  'list_follows',
  'mark_all_notifications_read',
  'mark_conversation_read',
  'mod_remove_comment',
  'mod_remove_post',
  'mod_remove_story',
  'mod_restore_post',
  'mod_set_report_status',
  'my_conversations',
  'my_devices',
  'my_friend_requests',
  'my_friends',
  'my_secure_conversations',
  'post_commit',
  'remove_friend',
  'remove_group_member',
  'respond_friend_request',
  'search_hashtags',
  'search_profiles',
  'send_friend_request',
  'set_conversation_theme',
  'set_disappearing_messages',
  'set_group_policy',
  'set_member_role',
  'story_tray',
  'story_viewers',
  'suggested_profiles',
  'touch_activity',
  'unread_counts',
  'update_group_info',
  'username_available',
];
// RPCs only the Edge Functions call, with the service-role key.
const SERVICE_RPCS = [
  'claim_media_deletions(integer)',
  'find_orphan_media(interval, integer)',
  'purge_expired_envelopes()',
  'purge_expired_stories(interval)',
  'should_push_message(uuid, uuid)',
];
// Tables the Edge Functions read and write with the service-role key.
const SERVICE_TABLES = ['audit_logs', 'device_tokens', 'messages', 'profiles', 'user_settings'];

async function canExecute(db: TestDb, role: string, signature: string) {
  const [row] = await db.admin<{ ok: boolean }>(
    `select has_function_privilege($1, $2::regprocedure, 'execute') as ok`,
    [role, `public.${signature}`],
  );
  return row!.ok;
}

describe('strict mode (no default privileges, like newer hosted projects)', () => {
  it('lets a signed-in user say hi: create_secure_conversation starts a chat', async () => {
    const a = await strict.createUser('sg_hi_a');
    const b = await strict.createUser('sg_hi_b');
    const [chat] = await strict.as<{ id: string }>(
      a,
      `select public.create_secure_conversation('direct', $1::uuid[], null) as id`,
      [[b.id]],
    );
    expect(chat!.id).toMatch(/^[0-9a-f-]{36}$/);
    const theirs = await strict.as<{ conversation_id: string }>(
      b,
      `select conversation_id from public.my_secure_conversations()`,
    );
    expect(theirs.map((c) => c.conversation_id)).toEqual([chat!.id]);
  });

  it('lets signed-in users execute every RPC the apps call', async () => {
    const rows = await strict.admin<{ name: string; signature: string; ok: boolean }>(
      `select p.proname as name, p.oid::regprocedure::text as signature,
              has_function_privilege('authenticated', p.oid, 'execute') as ok
       from pg_proc p
       where p.pronamespace = 'public'::regnamespace and p.proname = any($1::text[])`,
      [CLIENT_RPCS],
    );
    expect(CLIENT_RPCS.filter((name) => !rows.some((r) => r.name === name))).toEqual([]);
    expect(rows.filter((r) => !r.ok).map((r) => r.signature)).toEqual([]);
  });

  it('keeps the Edge Functions working: service_role has its RPCs and tables', async () => {
    for (const signature of SERVICE_RPCS) {
      expect(await canExecute(strict, 'service_role', signature), signature).toBe(true);
    }
    for (const table of SERVICE_TABLES) {
      const [row] = await strict.admin<{ ok: boolean }>(
        `select has_table_privilege('service_role', $1::regclass, 'select')
            and has_table_privilege('service_role', $1::regclass, 'insert')
            and has_table_privilege('service_role', $1::regclass, 'update')
            and has_table_privilege('service_role', $1::regclass, 'delete') as ok`,
        [`public.${table}`],
      );
      expect(row!.ok, table).toBe(true);
    }
    await expect(
      strict.as('service', `select token from device_tokens limit 1`),
    ).resolves.toBeDefined();
  });

  it('keeps explicitly revoked tables out of reach of anon and authenticated', async () => {
    const user = await strict.createUser('sg_revoked');
    for (const table of ['friend_requests', 'friendships', 'user_activity']) {
      for (const role of ['anon', 'authenticated']) {
        const [row] = await strict.admin<{ any_table: boolean; any_column: boolean }>(
          `select has_table_privilege($1, $2::regclass,
                    'select, insert, update, delete, truncate, references, trigger') as any_table,
                  has_any_column_privilege($1, $2::regclass,
                    'select, insert, update, references') as any_column`,
          [role, `public.${table}`],
        );
        expect(row, `${role} on ${table}`).toEqual({ any_table: false, any_column: false });
      }
      await expectDenied(strict.as(user, `select * from ${table}`), /permission denied/);
      await expectDenied(strict.as('anon', `select * from ${table}`), /permission denied/);
    }
    // Legacy plaintext DMs stay read-only (0011).
    await expectDenied(
      strict.as(
        user,
        `insert into messages (conversation_id, sender_id, body) values ($1, $2, 'x')`,
        [user.id, user.id],
      ),
      /permission denied/,
    );
    const [priv] = await strict.admin<{ anon: boolean; auth: boolean }>(
      `select has_schema_privilege('anon', 'private', 'usage') as anon,
              has_schema_privilege('authenticated', 'private', 'usage') as auth`,
    );
    expect(priv).toEqual({ anon: false, auth: false });
  });

  it('keeps revoked and service-only functions away from anon and authenticated', async () => {
    for (const signature of [...SERVICE_RPCS, 'start_direct_conversation(uuid)']) {
      expect(await canExecute(strict, 'anon', signature), `anon: ${signature}`).toBe(false);
      expect(await canExecute(strict, 'authenticated', signature), `auth: ${signature}`).toBe(
        false,
      );
    }
    for (const signature of [
      'create_secure_conversation(text, uuid[], text)',
      'claim_key_packages(uuid[])',
      'post_commit(uuid, uuid, bigint, text, uuid, jsonb)',
      'send_friend_request(text)',
      'my_friends()',
      'last_seen(uuid[])',
      'my_devices()',
      'admin_set_role(uuid, text, boolean)',
    ]) {
      expect(await canExecute(strict, 'anon', signature), `anon: ${signature}`).toBe(false);
    }
    await expectDenied(
      strict.as(
        'anon',
        `select public.create_secure_conversation('direct', array[gen_random_uuid()], null)`,
      ),
      /permission denied/,
    );
  });
});

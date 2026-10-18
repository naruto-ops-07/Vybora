import { type PGlite, type Transaction } from '@electric-sql/pglite';
import {
  applyMigrations,
  bootDatabase,
  grantsModeFromEnv,
  migrationFiles,
  type GrantsMode,
} from './boot.mjs';

export { migrationFiles, type GrantsMode };

export type Actor = { id: string } | 'anon' | 'service';

export interface Row {
  [key: string]: unknown;
}

/**
 * A real Postgres 17 (PGlite/WASM) with the Supabase shim and all VYBORA
 * migrations applied. Queries can run as anon, as a specific authenticated
 * user (via request.jwt.claims, exactly like PostgREST), or as service_role.
 *
 * The whole suite runs twice (vitest.config.ts): once with Supabase's old
 * default privileges and once in strict mode without them, the way newer
 * hosted projects behave (see harness/boot.mjs).
 */
export class TestDb {
  private constructor(
    readonly pg: PGlite,
    readonly grants: GrantsMode,
  ) {}

  /**
   * @param upTo apply only migrations whose filename sorts at or before this
   *   prefix (e.g. '20261010000010'); use `applyRemainingMigrations()` later to
   *   test a migration against data created under the previous schema.
   * @param options.grants privilege mode; defaults to the Vitest project's
   *   (VYBORA_DB_GRANTS), or 'defaults' when unset.
   */
  static async create(upTo?: string, options: { grants?: GrantsMode } = {}): Promise<TestDb> {
    const grants = options.grants ?? grantsModeFromEnv();
    const db = new TestDb(await bootDatabase({ mode: grants, ...(upTo ? { upTo } : {}) }), grants);
    db.applied = upTo;
    return db;
  }

  private applied: string | undefined;

  /** Apply the migrations skipped by `create(upTo)`. */
  async applyRemainingMigrations() {
    if (!this.applied) return;
    await applyMigrations(this.pg, migrationFiles({ after: this.applied }));
    this.applied = undefined;
  }

  /** Create an auth user; the on_auth_user_created trigger provisions the profile. */
  async createUser(username: string, opts: { private?: boolean; displayName?: string } = {}) {
    const res = await this.pg.query<{ id: string }>(
      `insert into auth.users (email, raw_user_meta_data) values ($1, $2) returning id`,
      [
        `${username}.${Math.random().toString(36).slice(2, 10)}@test.vybora.dev`,
        JSON.stringify({ username, display_name: opts.displayName ?? username }),
      ],
    );
    const id = res.rows[0]!.id;
    if (opts.private) {
      await this.pg.query(`update public.profiles set is_private = true where id = $1`, [id]);
    }
    return { id, username };
  }

  /** Superuser query (bypasses RLS) — for arranging fixtures and asserting state. */
  async admin<T = Row>(sql: string, params: unknown[] = []): Promise<T[]> {
    return (await this.pg.query<T>(sql, params)).rows;
  }

  /** Run a statement as the given actor inside its own transaction. */
  async as<T = Row>(actor: Actor, sql: string, params: unknown[] = []): Promise<T[]> {
    return this.pg.transaction(async (tx: Transaction) => {
      await impersonate(tx, actor);
      return (await tx.query<T>(sql, params)).rows;
    });
  }

  /** Run a statement as `actor` on a Realtime channel topic (Realtime Authorization policies). */
  async asOnTopic<T = Row>(
    actor: Actor,
    topic: string,
    sql: string,
    params: unknown[] = [],
  ): Promise<T[]> {
    return this.pg.transaction(async (tx: Transaction) => {
      await impersonate(tx, actor);
      await tx.query(`select set_config('realtime.topic', $1, true)`, [topic]);
      return (await tx.query<T>(sql, params)).rows;
    });
  }

  /** Simulate a Storage upload: inserts into storage.objects under Storage RLS. */
  async upload(actor: Actor, bucket: string, name: string, mimetype: string) {
    const owner = typeof actor === 'object' ? actor.id : null;
    return this.as(
      actor,
      `insert into storage.objects (bucket_id, name, owner, owner_id, metadata)
       values ($1, $2, $3, $4, $5) returning id`,
      [bucket, name, owner, owner, JSON.stringify({ mimetype, size: 1024 })],
    );
  }

  async close() {
    await this.pg.close();
  }
}

async function impersonate(tx: Transaction, actor: Actor) {
  if (actor === 'service') {
    await tx.exec(`set local role service_role`);
    await tx.query(`select set_config('request.jwt.claims', $1, true)`, [
      JSON.stringify({ role: 'service_role' }),
    ]);
  } else if (actor === 'anon') {
    await tx.exec(`set local role anon`);
    await tx.query(`select set_config('request.jwt.claims', $1, true)`, [
      JSON.stringify({ role: 'anon' }),
    ]);
  } else {
    await tx.exec(`set local role authenticated`);
    await tx.query(`select set_config('request.jwt.claims', $1, true)`, [
      JSON.stringify({ sub: actor.id, role: 'authenticated' }),
    ]);
  }
}

/** Assert a promise rejects (RLS violation, permission denied, trigger exception…). */
export async function expectDenied(promise: Promise<unknown>, match?: RegExp): Promise<string> {
  try {
    await promise;
  } catch (error) {
    const message = (error as Error).message;
    if (match && !match.test(message)) {
      throw new Error(`Expected error matching ${match}, got: ${message}`);
    }
    return message;
  }
  throw new Error('Expected operation to be denied, but it succeeded');
}

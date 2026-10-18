// @ts-check
// Boots the database the test suite runs against: a real Postgres 17
// (PGlite/WASM), the Supabase shim, then every file in supabase/migrations in
// order. Shared by the Vitest harness (db.ts) and scripts/gen-explicit-grants.mjs
// so the generator reads exactly the database the tests run against.
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';

const here = dirname(fileURLToPath(import.meta.url));
export const migrationsDir = join(here, '..', '..', 'migrations');

/**
 * How the API roles get privileges in schema public.
 *  - 'defaults': the shim installs Supabase's old default privileges
 *    (`alter default privileges in schema public grant all ... to anon,
 *    authenticated, service_role`), so every object a migration creates is
 *    granted to all three roles unless the migration revokes it.
 *  - 'strict': no default privileges, like newer hosted projects. A role can
 *    use an object in public only if a migration granted it explicitly.
 * @typedef {'defaults' | 'strict'} GrantsMode
 */

/** Env var each Vitest project sets to pick the mode (see vitest.config.ts). */
export const GRANTS_ENV = 'VYBORA_DB_GRANTS';

/**
 * @param {Record<string, string | undefined>} [env]
 * @returns {GrantsMode}
 */
export function grantsModeFromEnv(env = process.env) {
  const value = env[GRANTS_ENV] || 'defaults';
  if (value !== 'defaults' && value !== 'strict') {
    throw new Error(`${GRANTS_ENV} must be "defaults" or "strict", got "${value}"`);
  }
  return value;
}

// One statement per line in the shim, e.g.
//   alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
const PUBLIC_DEFAULT_PRIVILEGES =
  /^[ \t]*alter\s+default\s+privileges\s+in\s+schema\s+public\b[^;]*;[ \t]*\r?\n/gim;

/**
 * The shim SQL for a mode. Strict mode drops only the default privileges for
 * schema public; the auth/storage/realtime parts stand in for schemas Supabase
 * manages itself and stay as they are.
 * @param {GrantsMode} mode
 */
export function shimSql(mode) {
  const sql = readFileSync(join(here, 'supabase-shim.sql'), 'utf8');
  if (mode === 'defaults') return sql;
  let removed = 0;
  const strict = sql.replace(PUBLIC_DEFAULT_PRIVILEGES, () => {
    removed += 1;
    return '';
  });
  // Fail loudly if the shim is reworded, rather than silently testing nothing.
  if (removed === 0 || /alter\s+default\s+privileges/i.test(strict)) {
    throw new Error(
      'Strict mode could not remove the default privileges from supabase-shim.sql. ' +
        'Keep each `alter default privileges in schema public ...;` on its own line.',
    );
  }
  return strict;
}

/**
 * Migration files in apply order.
 * @param {{ upTo?: string, after?: string }} [range] `upTo`: only files whose
 *   name sorts at or before this prefix (e.g. '20261010000010'); `after`: only
 *   files after it.
 */
export function migrationFiles({ upTo, after } = {}) {
  return readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort()
    .filter((f) => !upTo || f <= `${upTo}~`)
    .filter((f) => !after || f > `${after}~`)
    .map((f) => join(migrationsDir, f));
}

/**
 * @param {PGlite} pg
 * @param {string[]} files
 */
export async function applyMigrations(pg, files) {
  for (const file of files) {
    try {
      await pg.exec(readFileSync(file, 'utf8'));
    } catch (error) {
      throw new Error(`Migration failed: ${file}\n${/** @type {Error} */ (error).message}`);
    }
  }
}

/**
 * A fresh database with the shim for `mode` and the migrations up to `upTo`
 * (all of them when omitted).
 * @param {{ mode: GrantsMode, upTo?: string }} options
 */
export async function bootDatabase({ mode, upTo }) {
  const pg = new PGlite();
  await pg.exec(shimSql(mode));
  await applyMigrations(pg, migrationFiles(upTo ? { upTo } : {}));
  return pg;
}

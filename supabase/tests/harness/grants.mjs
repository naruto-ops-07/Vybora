// @ts-check
// Reads the privileges the API roles hold on schema public objects, compares
// two databases, and renders the explicit GRANT statements that reproduce a
// snapshot. Used by scripts/gen-explicit-grants.mjs (writes the migration) and
// explicit-grants.test.ts (drift guard).

/** The roles PostgREST, Storage and Edge Functions act as. */
export const API_ROLES = ['anon', 'authenticated', 'service_role'];

/**
 * One privilege an API role holds in its own name: an ACL entry naming the
 * role (not PUBLIC, not via role membership).
 *  - object: fully qualified and quoted; functions carry their argument types
 *  - column: quoted column name for a column-level grant, else null
 *  - position: the column's attnum (0 otherwise), only used for ordering
 * @typedef {{
 *   kind: 'schema' | 'table' | 'view' | 'sequence' | 'function' | 'procedure',
 *   object: string,
 *   column: string | null,
 *   position: number,
 *   role: string,
 *   privilege: string,
 *   grantable: boolean,
 * }} Privilege
 */

/** @typedef {{ query: (sql: string, params?: unknown[]) => Promise<{ rows: any[] }> }} Queryable */

// aclexplode() over every ACL in schema public that names an API role.
// format_type() runs under an empty search_path, so every type outside
// pg_catalog comes out schema-qualified. Extension members are skipped: their
// privileges belong to the extension (and hosted projects keep extensions
// outside public).
const SNAPSHOT_SQL = `
with roles as (
  select oid, rolname from pg_roles where rolname = any($1::text[])
),
ns as (
  select oid, nspname, nspacl from pg_namespace where nspname = 'public'
),
rels as (
  select c.oid, c.relname, c.relkind, c.relacl
  from pg_class c join ns on ns.oid = c.relnamespace
  where c.relkind in ('r', 'p', 'v', 'm', 'f', 'S')
    and not exists (select 1 from pg_depend d
                    where d.classid = 'pg_class'::regclass and d.objid = c.oid and d.deptype = 'e')
),
procs as (
  select p.oid, p.proname, p.prokind, p.proacl,
         (select coalesce(string_agg(format_type(t.type, null), ', ' order by t.n), '')
          from unnest(p.proargtypes::oid[]) with ordinality as t (type, n)) as args
  from pg_proc p join ns on ns.oid = p.pronamespace
  where not exists (select 1 from pg_depend d
                    where d.classid = 'pg_proc'::regclass and d.objid = p.oid and d.deptype = 'e')
)
select 'schema' as kind, quote_ident(ns.nspname) as object, null as "column", 0 as position,
       r.rolname as role, a.privilege_type as privilege, a.is_grantable as grantable
from ns cross join lateral aclexplode(ns.nspacl) a join roles r on r.oid = a.grantee
union all
select case when c.relkind = 'S' then 'sequence' when c.relkind in ('v', 'm') then 'view' else 'table' end,
       format('%I.%I', 'public', c.relname), null, 0, r.rolname, a.privilege_type, a.is_grantable
from rels c cross join lateral aclexplode(c.relacl) a join roles r on r.oid = a.grantee
union all
select case when c.relkind in ('v', 'm') then 'view' else 'table' end,
       format('%I.%I', 'public', c.relname), quote_ident(att.attname), att.attnum,
       r.rolname, a.privilege_type, a.is_grantable
from rels c
join pg_attribute att on att.attrelid = c.oid and att.attnum > 0 and not att.attisdropped
cross join lateral aclexplode(att.attacl) a join roles r on r.oid = a.grantee
where c.relkind <> 'S'
union all
select case when p.prokind = 'p' then 'procedure' else 'function' end,
       format('%I.%I(%s)', 'public', p.proname, p.args), null, 0,
       r.rolname, a.privilege_type, a.is_grantable
from procs p cross join lateral aclexplode(p.proacl) a join roles r on r.oid = a.grantee
`;

const KIND_ORDER = ['schema', 'table', 'view', 'sequence', 'function', 'procedure'];
const PRIVILEGE_ORDER = [
  'USAGE',
  'CREATE',
  'SELECT',
  'INSERT',
  'UPDATE',
  'DELETE',
  'TRUNCATE',
  'REFERENCES',
  'TRIGGER',
  'MAINTAIN',
  'EXECUTE',
];
/** @param {string[]} order @param {string} value */
const rank = (order, value) => (order.includes(value) ? order.indexOf(value) : order.length);

/** @param {Privilege} a @param {Privilege} b */
function comparePrivileges(a, b) {
  return (
    rank(KIND_ORDER, a.kind) - rank(KIND_ORDER, b.kind) ||
    (a.object < b.object ? -1 : a.object > b.object ? 1 : 0) ||
    a.position - b.position ||
    rank(API_ROLES, a.role) - rank(API_ROLES, b.role) ||
    rank(PRIVILEGE_ORDER, a.privilege) - rank(PRIVILEGE_ORDER, b.privilege) ||
    Number(a.grantable) - Number(b.grantable)
  );
}

/** @param {Privilege} p */
export const privilegeKey = (p) =>
  [p.kind, p.object, p.column ?? '', p.role, p.privilege, p.grantable].join('|');

/**
 * Every privilege the API roles hold directly on schema public and on its
 * tables, views, columns, sequences and functions, sorted so snapshots compare.
 * @param {Queryable} pg
 * @returns {Promise<Privilege[]>}
 */
export async function readClientPrivileges(pg) {
  const rows = await queryWithoutSearchPath(pg, SNAPSHOT_SQL);
  return rows
    .map(
      (r) =>
        /** @type {Privilege} */ ({
          ...r,
          position: Number(r.position),
          grantable: Boolean(r.grantable),
        }),
    )
    .sort(comparePrivileges);
}

// has_*_privilege() for every API role, object and privilege in schema public:
// what a role can actually do, counting grants to PUBLIC as well as its own.
const EFFECTIVE_SQL = `
with roles as (
  select unnest($1::text[]) as role
),
rels as (
  select c.oid, c.relname, c.relkind
  from pg_class c
  where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'p', 'v', 'm', 'f', 'S')
    and not exists (select 1 from pg_depend d
                    where d.classid = 'pg_class'::regclass and d.objid = c.oid and d.deptype = 'e')
),
procs as (
  select p.oid from pg_proc p
  where p.pronamespace = 'public'::regnamespace
    and not exists (select 1 from pg_depend d
                    where d.classid = 'pg_proc'::regclass and d.objid = p.oid and d.deptype = 'e')
)
select 'schema public' as object, r.role, priv as privilege
from roles r cross join unnest(array['USAGE', 'CREATE']) priv
where has_schema_privilege(r.role, 'public', priv)
union all
select format('sequence %I.%I', 'public', c.relname), r.role, priv
from rels c cross join roles r cross join unnest(array['USAGE', 'SELECT', 'UPDATE']) priv
where c.relkind = 'S' and has_sequence_privilege(r.role, c.oid, priv)
union all
select format('table %I.%I', 'public', c.relname), r.role, priv
from rels c cross join roles r
cross join unnest(array['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER']) priv
where c.relkind <> 'S' and has_table_privilege(r.role, c.oid, priv)
union all
select format('column %I.%I.%I', 'public', c.relname, att.attname), r.role, priv
from rels c
join pg_attribute att on att.attrelid = c.oid and att.attnum > 0 and not att.attisdropped
cross join roles r cross join unnest(array['SELECT', 'INSERT', 'UPDATE', 'REFERENCES']) priv
where c.relkind <> 'S' and has_column_privilege(r.role, c.oid, att.attnum, priv)
union all
select 'function ' || p.oid::regprocedure::text, r.role, 'EXECUTE'
from procs p cross join roles r
where has_function_privilege(r.role, p.oid, 'EXECUTE')
`;

/**
 * What each API role can actually do on schema public objects (its own grants,
 * PUBLIC's, and table-level grants implying column access), as sorted
 * 'object | role | privilege' strings. Complements readClientPrivileges(),
 * which lists only the ACL entries that name the role.
 * @param {Queryable} pg
 * @returns {Promise<string[]>}
 */
export async function readEffectivePrivileges(pg) {
  const rows = await queryWithoutSearchPath(pg, EFFECTIVE_SQL);
  return rows.map((r) => `${r.object} | ${r.role} | ${r.privilege}`).sort();
}

/**
 * Runs `sql` with $1 = API_ROLES under an empty search_path, so every name
 * and type outside pg_catalog comes out schema-qualified; then restores it.
 * @param {Queryable} pg
 * @param {string} sql
 */
async function queryWithoutSearchPath(pg, sql) {
  const { rows: saved } = await pg.query(`select current_setting('search_path') as path`);
  await pg.query(`select set_config('search_path', '', false)`);
  try {
    return (await pg.query(sql, [API_ROLES])).rows;
  } finally {
    await pg.query(`select set_config('search_path', $1, false)`, [saved[0].path]);
  }
}

/**
 * Privileges in `expected` but not in `actual` (missing) and the reverse (extra).
 * @param {Privilege[]} expected
 * @param {Privilege[]} actual
 */
export function diffPrivileges(expected, actual) {
  const inActual = new Set(actual.map(privilegeKey));
  const inExpected = new Set(expected.map(privilegeKey));
  return {
    missing: expected.filter((p) => !inActual.has(privilegeKey(p))),
    extra: actual.filter((p) => !inExpected.has(privilegeKey(p))),
  };
}

/** @param {Privilege} p */
export function describePrivilege(p) {
  const on = p.column ? `${p.object} (${p.column})` : p.object;
  const option = p.grantable ? ' with grant option' : '';
  return `${p.privilege.toLowerCase()} on ${p.kind} ${on} to ${p.role}${option}`;
}

/**
 * What `grant all` means on this server for each object kind that has more
 * than one privilege (PostgreSQL 17 adds MAINTAIN to tables).
 * @param {Queryable} pg
 * @returns {Promise<Record<string, string[]>>}
 */
export async function readAllPrivileges(pg) {
  const { rows } = await pg.query(
    `select k.kind, array_agg(a.privilege_type::text) as privileges
     from (values ('table', 'r'), ('view', 'r'), ('sequence', 's'), ('schema', 'n')) as k (kind, code)
     cross join lateral aclexplode(acldefault(k.code::"char", 10::oid)) a
     where a.grantee = 10
     group by k.kind`,
  );
  return Object.fromEntries(rows.map((r) => [r.kind, r.privileges]));
}

// Exists only on PostgreSQL 17+: a project on 15 rejects `grant maintain`.
const PG17_ONLY = ['MAINTAIN'];

/** @param {string[]} items */
const list = (items) => items.join(', ');

/**
 * GRANT statements that reproduce `privileges` exactly, per object:
 * object-level first, then column-level. Roles holding the same privileges
 * share a statement; a role holding everything gets `all`, which stays valid
 * on PostgreSQL 15 and 17. Nothing absent from the snapshot is mentioned.
 * @param {Privilege[]} privileges
 * @param {Record<string, string[]>} allPrivileges from readAllPrivileges()
 * @returns {{ kind: Privilege['kind'], sql: string }[]}
 */
export function renderGrantStatements(privileges, allPrivileges) {
  /** @type {Map<string, Privilege[]>} */
  const byObject = new Map();
  for (const p of [...privileges].sort(comparePrivileges)) {
    const key = `${p.kind} ${p.object}`;
    byObject.set(key, [...(byObject.get(key) ?? []), p]);
  }

  /** @type {{ kind: Privilege['kind'], sql: string }[]} */
  const statements = [];
  for (const entries of byObject.values()) {
    const first = /** @type {Privilege} */ (entries[0]);
    const on = `on ${first.kind === 'view' ? 'table' : first.kind} ${first.object}`;
    // Statement (without its grantees) -> roles, in emit order.
    /** @type {Map<string, { grant: string, option: string, roles: string[] }>} */
    const objectLevel = new Map();
    /** @type {typeof objectLevel} */
    const columnLevel = new Map();
    /** @param {typeof objectLevel} into @param {string} grant @param {string} option @param {string} role */
    const add = (into, grant, option, role) => {
      const key = JSON.stringify([grant, option]);
      const entry = into.get(key) ?? { grant, option, roles: [] };
      entry.roles.push(role);
      into.set(key, entry);
    };

    for (const role of API_ROLES) {
      for (const grantable of [false, true]) {
        const mine = entries.filter((p) => p.role === role && p.grantable === grantable);
        const option = grantable ? ' with grant option' : '';

        const whole = mine.filter((p) => p.column === null).map((p) => p.privilege);
        if (whole.length) {
          const all = allPrivileges[first.kind] ?? [];
          const isAll = all.length > 1 && all.every((p) => whole.includes(p));
          const pg17Only = whole.filter((p) => PG17_ONLY.includes(p));
          if (!isAll && pg17Only.length) {
            throw new Error(
              `${role} holds ${list(pg17Only)} on ${first.object} without the rest of ALL; ` +
                'that privilege exists only on PostgreSQL 17+, so grant it by hand.',
            );
          }
          const what = isAll ? 'all' : list(whole.map((p) => p.toLowerCase()));
          add(objectLevel, `grant ${what} ${on}`, option, role);
        }

        /** @type {Map<string, string[]>} privilege -> columns (in column order) */
        const columns = new Map();
        for (const p of mine.filter((p) => p.column !== null)) {
          columns.set(p.privilege, [...(columns.get(p.privilege) ?? []), String(p.column)]);
        }
        if (columns.size) {
          const what = [...columns.keys()]
            .sort((a, b) => rank(PRIVILEGE_ORDER, a) - rank(PRIVILEGE_ORDER, b))
            .map((priv) => `${priv.toLowerCase()} (${list(columns.get(priv) ?? [])})`);
          add(columnLevel, `grant ${list(what)} ${on}`, option, role);
        }
      }
    }

    for (const { grant, option, roles } of [...objectLevel.values(), ...columnLevel.values()]) {
      statements.push({ kind: first.kind, sql: `${grant} to ${list(roles)}${option};` });
    }
  }
  return statements;
}

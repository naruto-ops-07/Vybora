#!/usr/bin/env node
// Generates packages/types/src/database.ts from the actual migrations.
//
// It boots an in-process Postgres (PGlite), applies the Supabase shim and every
// file in supabase/migrations, then introspects the `public` schema and emits a
// `Database` type in the same shape as `supabase gen types typescript`.
//
// When you have a linked Supabase project you can use the official generator
// instead (see docs/DATABASE.md); both produce compatible shapes.

import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import { format, resolveConfig } from 'prettier';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const migrationsDir = join(root, 'supabase', 'migrations');
const outFile = join(root, 'packages', 'types', 'src', 'database.ts');

const pg = new PGlite();
await pg.exec(
  readFileSync(join(root, 'supabase', 'tests', 'harness', 'supabase-shim.sql'), 'utf8'),
);
for (const f of readdirSync(migrationsDir)
  .filter((f) => f.endsWith('.sql'))
  .sort()) {
  await pg.exec(readFileSync(join(migrationsDir, f), 'utf8'));
}

const q = async (sql, params = []) => (await pg.query(sql, params)).rows;

function tsType(udt) {
  const isArray = udt.startsWith('_');
  const base = isArray ? udt.slice(1) : udt;
  let t;
  switch (base) {
    case 'uuid':
    case 'text':
    case 'varchar':
    case 'bpchar':
    case 'citext':
    case 'name':
    case 'timestamptz':
    case 'timestamp':
    case 'date':
    case 'time':
    case 'timetz':
    case 'interval':
      t = 'string';
      break;
    case 'int2':
    case 'int4':
    case 'int8':
    case 'float4':
    case 'float8':
    case 'numeric':
      t = 'number';
      break;
    case 'bool':
      t = 'boolean';
      break;
    case 'json':
    case 'jsonb':
      t = 'Json';
      break;
    case 'void':
      t = 'undefined';
      break;
    default:
      t = 'unknown';
  }
  return isArray ? `${t}[]` : t;
}

const ind = (n) => '  '.repeat(n);
const key = (k) => (/^[a-z_][a-z0-9_]*$/i.test(k) ? k : JSON.stringify(k));

// ---------- tables & views ----------
const relations = await q(`
  select c.relname as name, c.relkind as kind
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind in ('r', 'v')
  order by c.relname`);

const columns = await q(`
  select table_name, column_name, udt_name, is_nullable = 'YES' as nullable,
         column_default is not null or is_identity = 'YES' as has_default, ordinal_position
  from information_schema.columns
  where table_schema = 'public'
  order by table_name, ordinal_position`);

const fks = await q(`
  select con.conname as name, rel.relname as table_name, frel.relname as referenced,
         array(select a.attname from unnest(con.conkey) with ordinality k(num, ord)
               join pg_attribute a on a.attrelid = con.conrelid and a.attnum = k.num order by k.ord) as cols,
         array(select a.attname from unnest(con.confkey) with ordinality k(num, ord)
               join pg_attribute a on a.attrelid = con.confrelid and a.attnum = k.num order by k.ord) as refcols,
         exists (
           select 1 from pg_index i
           where i.indrelid = con.conrelid and i.indisunique
             and (select array_agg(x order by x) from unnest(i.indkey::int2[]) x) = (select array_agg(x order by x) from unnest(con.conkey) x)
         ) as one_to_one
  from pg_constraint con
  join pg_class rel on rel.oid = con.conrelid
  join pg_namespace n on n.oid = rel.relnamespace
  join pg_class frel on frel.oid = con.confrelid
  join pg_namespace fn on fn.oid = frel.relnamespace
  where con.contype = 'f' and n.nspname = 'public' and fn.nspname = 'public'
  order by con.conname`);

const colsOf = (t) => columns.filter((c) => c.table_name === t);

function rowType(t, level) {
  return colsOf(t)
    .map(
      (c) =>
        `${ind(level)}${key(c.column_name)}: ${tsType(c.udt_name)}${c.nullable ? ' | null' : ''}`,
    )
    .join('\n');
}
function insertType(t, level) {
  return colsOf(t)
    .map(
      (c) =>
        `${ind(level)}${key(c.column_name)}${c.nullable || c.has_default ? '?' : ''}: ${tsType(c.udt_name)}${c.nullable ? ' | null' : ''}`,
    )
    .join('\n');
}
function updateType(t, level) {
  return colsOf(t)
    .map(
      (c) =>
        `${ind(level)}${key(c.column_name)}?: ${tsType(c.udt_name)}${c.nullable ? ' | null' : ''}`,
    )
    .join('\n');
}
function relationships(t, level) {
  const items = fks.filter((f) => f.table_name === t);
  if (!items.length) return '[]';
  return `[\n${items
    .map(
      (f) =>
        `${ind(level + 1)}{\n${ind(level + 2)}foreignKeyName: ${JSON.stringify(f.name)}\n${ind(level + 2)}columns: ${JSON.stringify(f.cols)}\n${ind(level + 2)}isOneToOne: ${f.one_to_one}\n${ind(level + 2)}referencedRelation: ${JSON.stringify(f.referenced)}\n${ind(level + 2)}referencedColumns: ${JSON.stringify(f.refcols)}\n${ind(level + 1)}},`,
    )
    .join('\n')}\n${ind(level)}]`;
}

const tables = relations.filter((r) => r.kind === 'r');
const views = relations.filter((r) => r.kind === 'v');

// ---------- functions ----------
const fns = await q(`
  select p.proname as name,
         p.proretset as returns_set,
         rt.typname as ret_type,
         rt.typtype as ret_typtype,
         rtrel.relname as ret_relname,
         coalesce(p.proargnames, '{}') as arg_names,
         coalesce(p.proargmodes::text[], '{}') as arg_modes,
         coalesce(array(
           select t.typname
           from unnest(coalesce(p.proallargtypes, p.proargtypes::oid[])) with ordinality as a(typ, ord)
           join pg_type t on t.oid = a.typ
           order by a.ord
         ), '{}') as arg_types,
         p.pronargs as nargs,
         p.pronargdefaults as ndefaults
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  join pg_type rt on rt.oid = p.prorettype
  left join pg_class rtrel on rtrel.oid = rt.typrelid
  where n.nspname = 'public' and p.prokind = 'f' and rt.typname <> 'trigger'
  order by p.proname`);

function fnType(f, level) {
  const modes = f.arg_modes.length ? f.arg_modes : f.arg_types.map(() => 'i');
  const inputs = [];
  const outputs = [];
  f.arg_types.forEach((t, i) => {
    const m = modes[i];
    const n = f.arg_names[i] ?? `arg${i}`;
    if (m === 'i' || m === 'b') inputs.push({ n, t });
    if (m === 't' || m === 'o' || m === 'b') outputs.push({ n, t });
  });
  const firstDefault = f.nargs - f.ndefaults;
  const args = inputs.length
    ? `{\n${inputs.map((a, i) => `${ind(level + 1)}${key(a.n)}${i >= firstDefault ? '?' : ''}: ${tsType(a.t)}`).join('\n')}\n${ind(level)}}`
    : 'Record<PropertyKey, never>';

  let ret;
  if (outputs.length) {
    ret = `{\n${outputs.map((o) => `${ind(level + 1)}${key(o.n)}: ${tsType(o.t)} | null`).join('\n')}\n${ind(level)}}`;
  } else if (f.ret_typtype === 'c' && f.ret_relname) {
    ret = `{\n${rowType(f.ret_relname, level + 1)}\n${ind(level)}}`;
  } else {
    ret = tsType(f.ret_type);
  }
  if (f.returns_set) ret = `${ret}[]`;
  return { args, ret };
}

// ---------- emit ----------
let out = `// AUTO-GENERATED by scripts/gen-db-types.mjs from supabase/migrations — do not edit by hand.
// Regenerate with: pnpm db:types

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  public: {
    Tables: {
`;
for (const t of tables) {
  out += `      ${key(t.name)}: {
        Row: {
${rowType(t.name, 5)}
        }
        Insert: {
${insertType(t.name, 5)}
        }
        Update: {
${updateType(t.name, 5)}
        }
        Relationships: ${relationships(t.name, 4)}
      }
`;
}
out += `    }
    Views: {
`;
for (const v of views) {
  out += `      ${key(v.name)}: {
        Row: {
${rowType(v.name, 5)}
        }
        Relationships: []
      }
`;
}
out += `    }
    Functions: {
`;
for (const f of fns) {
  const { args, ret } = fnType(f, 4);
  out += `      ${key(f.name)}: {
        Args: ${args}
        Returns: ${ret}
      }
`;
}
out += `    }
    Enums: Record<string, never>
    CompositeTypes: Record<string, never>
  }
};

type PublicSchema = Database['public'];
export type Tables<T extends keyof PublicSchema['Tables']> = PublicSchema['Tables'][T]['Row'];
export type TablesInsert<T extends keyof PublicSchema['Tables']> = PublicSchema['Tables'][T]['Insert'];
export type TablesUpdate<T extends keyof PublicSchema['Tables']> = PublicSchema['Tables'][T]['Update'];
export type Views<T extends keyof PublicSchema['Views']> = PublicSchema['Views'][T]['Row'];
export type FunctionReturns<T extends keyof PublicSchema['Functions']> = PublicSchema['Functions'][T]['Returns'];
`;

// Format with the repo's Prettier config so `pnpm format:check` and the CI
// drift gate (`git diff --exit-code`) agree on this file.
writeFileSync(
  outFile,
  await format(out, { ...(await resolveConfig(outFile)), parser: 'typescript' }),
);
console.log(
  `Wrote ${outFile} (${tables.length} tables, ${views.length} views, ${fns.length} functions)`,
);
await pg.close();

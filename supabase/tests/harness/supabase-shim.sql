-- Minimal, test-only emulation of the parts of a Supabase Postgres that the
-- VYBORA migrations depend on. NOT a migration; never applied to a real project.
--   * roles anon / authenticated / service_role (service_role bypasses RLS)
--   * auth.users + auth.uid()/auth.role()/auth.jwt() reading request.jwt.claims
--   * storage.buckets / storage.objects / storage.foldername()
--   * default privileges matching older Supabase projects (grant all → then
--     migrations revoke); the strict test mode (harness/boot.mjs) drops the
--     three schema-public lines below, like newer hosted projects
--   * the supabase_realtime publication

create role anon nologin noinherit;
create role authenticated nologin noinherit;
create role service_role nologin noinherit bypassrls;

grant usage on schema public to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;

create schema auth;
grant usage on schema auth to anon, authenticated, service_role;

create table auth.users (
  id uuid primary key default gen_random_uuid(),
  email text unique,
  raw_user_meta_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create function auth.jwt() returns jsonb language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb
$$;

create function auth.uid() returns uuid language sql stable as $$
  select nullif(auth.jwt() ->> 'sub', '')::uuid
$$;

create function auth.role() returns text language sql stable as $$
  select auth.jwt() ->> 'role'
$$;

grant execute on all functions in schema auth to anon, authenticated, service_role;

create schema storage;
grant usage on schema storage to anon, authenticated, service_role;

create table storage.buckets (
  id text primary key,
  name text not null unique,
  owner uuid,
  public boolean default false,
  file_size_limit bigint,
  allowed_mime_types text[],
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table storage.objects (
  id uuid primary key default gen_random_uuid(),
  bucket_id text references storage.buckets (id),
  name text not null,
  owner uuid,
  owner_id text,
  metadata jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  last_accessed_at timestamptz default now(),
  unique (bucket_id, name)
);

alter table storage.objects enable row level security;
alter table storage.buckets enable row level security;
create policy buckets_read on storage.buckets for select using (true);

grant all on storage.objects, storage.buckets to anon, authenticated, service_role;

create function storage.foldername(name text) returns text[] language plpgsql immutable as $$
declare
  _parts text[];
begin
  select string_to_array(name, '/') into _parts;
  return _parts[1:array_length(_parts, 1) - 1];
end
$$;

grant execute on all functions in schema storage to anon, authenticated, service_role;

create publication supabase_realtime;

-- Realtime Authorization (private channels): policies on realtime.messages
-- are evaluated with the channel topic available via realtime.topic().
create schema realtime;
grant usage on schema realtime to anon, authenticated, service_role;
create table realtime.messages (
  id bigint generated always as identity primary key,
  topic text not null,
  extension text not null default 'broadcast',
  payload jsonb,
  inserted_at timestamptz default now()
);
alter table realtime.messages enable row level security;
grant select, insert on realtime.messages to authenticated;
create function realtime.topic() returns text language sql stable as $$
  select nullif(current_setting('realtime.topic', true), '')
$$;
grant execute on function realtime.topic() to anon, authenticated, service_role;

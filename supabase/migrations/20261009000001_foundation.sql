-- =====================================================================
-- VYBORA · 0001 · Foundation
-- Profiles, settings, roles, audit log, notifications, device tokens,
-- shared helper functions and server-side rate limiting.
--
-- Conventions
--   * `public`  — tables/functions exposed through PostgREST. Every table has RLS.
--   * `private` — internal helpers and queues. NOT exposed, no client grants.
--   * Privileges are revoked and then re-granted explicitly per column where
--     clients may write, so counters/status columns can never be forged.
-- =====================================================================

create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to service_role;

-- ---------------------------------------------------------------------
-- Generic helpers
-- ---------------------------------------------------------------------

create or replace function private.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- Safe uuid parsing for storage path segments (never raises).
create or replace function public.try_uuid(p text)
returns uuid
language plpgsql
immutable
as $$
begin
  return p::uuid;
exception when others then
  return null;
end;
$$;

-- ---------------------------------------------------------------------
-- Profiles
-- ---------------------------------------------------------------------

create table public.profiles (
  id               uuid primary key references auth.users (id) on delete cascade,
  username         text not null unique
                   check (username ~ '^[a-z0-9._]{3,30}$' and username !~ '(^\.)|(\.$)|(\.\.)'),
  display_name     text not null default '' check (char_length(display_name) <= 60),
  bio              text not null default '' check (char_length(bio) <= 300),
  website          text check (website is null or (char_length(website) <= 200 and website ~* '^https?://[^\s]+$')),
  avatar_path      text check (avatar_path is null or char_length(avatar_path) <= 300),
  is_private       boolean not null default false,
  status           text not null default 'active' check (status in ('active', 'suspended')),
  posts_count      integer not null default 0 check (posts_count >= 0),
  followers_count  integer not null default 0 check (followers_count >= 0),
  following_count  integer not null default 0 check (following_count >= 0),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

comment on column public.profiles.posts_count is 'Server-maintained by triggers; repairable with public.admin_recount_counters().';

create index profiles_username_prefix_idx on public.profiles (username text_pattern_ops);
create index profiles_display_name_prefix_idx on public.profiles (lower(display_name) text_pattern_ops);
create index profiles_popular_idx on public.profiles (followers_count desc) where status = 'active' and not is_private;

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function private.set_updated_at();

create table public.user_settings (
  user_id          uuid primary key references public.profiles (id) on delete cascade,
  message_privacy  text not null default 'everyone' check (message_privacy in ('everyone', 'following')),
  push_enabled     boolean not null default true,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create trigger user_settings_set_updated_at
  before update on public.user_settings
  for each row execute function private.set_updated_at();

-- ---------------------------------------------------------------------
-- Roles (server-enforced; never inferred from username/email/client state)
-- ---------------------------------------------------------------------

create table public.user_roles (
  user_id     uuid not null references public.profiles (id) on delete cascade,
  role        text not null check (role in ('admin', 'moderator')),
  granted_by  uuid references public.profiles (id) on delete set null,
  created_at  timestamptz not null default now(),
  primary key (user_id, role)
);

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.user_roles r
    where r.user_id = auth.uid() and r.role = 'admin'
  );
$$;

create or replace function public.is_staff()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.user_roles r
    where r.user_id = auth.uid() and r.role in ('admin', 'moderator')
  );
$$;

-- True when the caller is signed in and their account is not suspended.
create or replace function public.current_user_active()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.status = 'active'
  );
$$;

-- ---------------------------------------------------------------------
-- Audit log (written only by trusted security-definer functions)
-- ---------------------------------------------------------------------

create table public.audit_logs (
  id          uuid primary key default gen_random_uuid(),
  actor_id    uuid references public.profiles (id) on delete set null,
  action      text not null,
  entity      text not null,
  entity_id   uuid,
  metadata    jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);

create index audit_logs_created_idx on public.audit_logs (created_at desc);
create index audit_logs_entity_idx on public.audit_logs (entity, entity_id);

create or replace function private.audit(p_action text, p_entity text, p_entity_id uuid, p_metadata jsonb default '{}'::jsonb)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.audit_logs (actor_id, action, entity, entity_id, metadata)
  values (auth.uid(), p_action, p_entity, p_entity_id, coalesce(p_metadata, '{}'::jsonb));
$$;

-- ---------------------------------------------------------------------
-- Server-side rate limiting
-- Usage: BEFORE INSERT trigger with args (user_column, window, max_rows).
-- Counts the caller's own recent rows; skipped for trusted server contexts
-- where auth.uid() is null (service role, migrations, seeds).
-- ---------------------------------------------------------------------

create or replace function private.enforce_rate_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_count integer;
begin
  if v_uid is null then
    return new;
  end if;
  execute format(
    'select count(*) from %I.%I where %I = $1 and created_at > now() - $2::interval',
    tg_table_schema, tg_table_name, tg_argv[0]
  ) into v_count using v_uid, tg_argv[1];
  if v_count >= tg_argv[2]::integer then
    raise exception 'rate_limit_exceeded'
      using hint = format('Too many %s. Please slow down and try again shortly.', tg_table_name),
            errcode = 'P0001';
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------
-- Reserved usernames + availability check (callable anonymously during signup)
-- ---------------------------------------------------------------------

create or replace function private.is_reserved_username(p text)
returns boolean
language sql
immutable
as $$
  select lower(p) = any (array[
    'admin', 'administrator', 'root', 'support', 'help', 'vybora', 'official', 'staff',
    'moderator', 'mod', 'security', 'system', 'api', 'www', 'about', 'explore', 'reels',
    'messages', 'inbox', 'settings', 'login', 'signup', 'logout', 'null', 'undefined'
  ]);
$$;

create or replace function public.username_available(p_username text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select lower(p_username) ~ '^[a-z0-9._]{3,30}$'
     and lower(p_username) !~ '(^\.)|(\.$)|(\.\.)'
     and not private.is_reserved_username(p_username)
     and not exists (select 1 from public.profiles p where p.username = lower(p_username));
$$;

-- ---------------------------------------------------------------------
-- Profile guard: path ownership and reserved names on update.
-- ---------------------------------------------------------------------

create or replace function private.profiles_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.username := lower(new.username);
  if new.username is distinct from old.username and private.is_reserved_username(new.username) then
    raise exception 'username_reserved' using errcode = 'P0001';
  end if;
  if new.avatar_path is distinct from old.avatar_path
     and new.avatar_path is not null
     and split_part(new.avatar_path, '/', 1) <> new.id::text then
    raise exception 'avatar_path_not_owned' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger profiles_guard
  before update on public.profiles
  for each row execute function private.profiles_guard();

-- ---------------------------------------------------------------------
-- New auth user → profile + settings
-- ---------------------------------------------------------------------

create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_username text := lower(coalesce(new.raw_user_meta_data ->> 'username', ''));
  v_display  text := left(coalesce(new.raw_user_meta_data ->> 'display_name', ''), 60);
begin
  if not public.username_available(v_username) then
    v_username := 'user_' || substr(replace(new.id::text, '-', ''), 1, 10);
  end if;
  insert into public.profiles (id, username, display_name) values (new.id, v_username, v_display);
  insert into public.user_settings (user_id) values (new.id);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();

-- ---------------------------------------------------------------------
-- Notifications (created only by trusted triggers)
-- ---------------------------------------------------------------------

create table public.notifications (
  id               uuid primary key default gen_random_uuid(),
  recipient_id     uuid not null references public.profiles (id) on delete cascade,
  actor_id         uuid references public.profiles (id) on delete cascade,
  type             text not null check (type in (
                     'follow', 'follow_request', 'follow_accept', 'like', 'comment', 'reply',
                     'mention', 'message', 'moderation')),
  post_id          uuid,
  comment_id       uuid,
  conversation_id  uuid,
  body             text check (body is null or char_length(body) <= 500),
  read_at          timestamptz,
  created_at       timestamptz not null default now()
);

create index notifications_recipient_idx on public.notifications (recipient_id, created_at desc, id desc);
create index notifications_unread_idx on public.notifications (recipient_id) where read_at is null;
-- Duplicate suppression (used with ON CONFLICT DO NOTHING).
create unique index notifications_like_uniq on public.notifications (recipient_id, actor_id, post_id) where type = 'like';
create unique index notifications_follow_uniq on public.notifications (recipient_id, actor_id, type)
  where type in ('follow', 'follow_request', 'follow_accept');
create unique index notifications_mention_uniq on public.notifications (recipient_id, actor_id, post_id, comment_id)
  where type = 'mention' and comment_id is not null;
create unique index notifications_mention_post_uniq on public.notifications (recipient_id, actor_id, post_id)
  where type = 'mention' and comment_id is null;
create unique index notifications_message_unread_uniq on public.notifications (recipient_id, conversation_id)
  where type = 'message' and read_at is null;

-- ---------------------------------------------------------------------
-- Push device tokens (owner-only; read by trusted edge function)
-- ---------------------------------------------------------------------

create table public.device_tokens (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  token         text not null unique check (char_length(token) between 10 and 300),
  platform      text not null check (platform in ('ios', 'android', 'web')),
  created_at    timestamptz not null default now(),
  last_seen_at  timestamptz not null default now()
);

create index device_tokens_user_idx on public.device_tokens (user_id);

-- ---------------------------------------------------------------------
-- Media deletion queue (drained by the `cleanup-media` edge function)
-- ---------------------------------------------------------------------

create table private.media_deletion_queue (
  id          bigint generated always as identity primary key,
  bucket_id   text not null,
  object_path text not null,
  reason      text not null,
  created_at  timestamptz not null default now(),
  unique (bucket_id, object_path)
);

create or replace function private.enqueue_media_deletion(p_bucket text, p_path text, p_reason text)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into private.media_deletion_queue (bucket_id, object_path, reason)
  values (p_bucket, p_path, p_reason)
  on conflict (bucket_id, object_path) do nothing;
$$;

create or replace function private.profiles_avatar_cleanup()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.avatar_path is not null and old.avatar_path is distinct from new.avatar_path then
    perform private.enqueue_media_deletion('avatars', old.avatar_path, 'avatar_replaced');
  end if;
  return new;
end;
$$;

create trigger profiles_avatar_cleanup
  after update of avatar_path on public.profiles
  for each row execute function private.profiles_avatar_cleanup();

-- ---------------------------------------------------------------------
-- RLS + privileges
-- ---------------------------------------------------------------------

alter table public.profiles       enable row level security;
alter table public.user_settings  enable row level security;
alter table public.user_roles     enable row level security;
alter table public.audit_logs     enable row level security;
alter table public.notifications  enable row level security;
alter table public.device_tokens  enable row level security;

revoke all on public.profiles, public.user_settings, public.user_roles, public.audit_logs,
              public.notifications, public.device_tokens from anon, authenticated;

-- profiles: readable by anyone (blocking/suspension filtering is applied in
-- 0002 once the relationship tables exist); owners may edit a safe column set.
grant select on public.profiles to anon, authenticated;
grant update (username, display_name, bio, website, avatar_path, is_private) on public.profiles to authenticated;

create policy profiles_update_own on public.profiles
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- user_settings: owner only.
grant select, update (message_privacy, push_enabled) on public.user_settings to authenticated;

create policy user_settings_select_own on public.user_settings
  for select to authenticated using (user_id = auth.uid());
create policy user_settings_update_own on public.user_settings
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- user_roles: users may see their own roles; admins see all. No client writes.
grant select on public.user_roles to authenticated;
create policy user_roles_select on public.user_roles
  for select to authenticated using (user_id = auth.uid() or public.is_admin());

-- audit_logs: admins only, read-only.
grant select on public.audit_logs to authenticated;
create policy audit_logs_select_admin on public.audit_logs
  for select to authenticated using (public.is_admin());

-- notifications: recipient only. Clients may mark read and delete; never insert.
grant select, delete, update (read_at) on public.notifications to authenticated;
create policy notifications_select_own on public.notifications
  for select to authenticated using (recipient_id = auth.uid());
create policy notifications_update_own on public.notifications
  for update to authenticated using (recipient_id = auth.uid()) with check (recipient_id = auth.uid());
create policy notifications_delete_own on public.notifications
  for delete to authenticated using (recipient_id = auth.uid());

-- device_tokens: owner only.
grant select, insert (token, platform), update (last_seen_at), delete on public.device_tokens to authenticated;
create policy device_tokens_select_own on public.device_tokens
  for select to authenticated using (user_id = auth.uid());
create policy device_tokens_insert_own on public.device_tokens
  for insert to authenticated with check (user_id = auth.uid());
create policy device_tokens_update_own on public.device_tokens
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy device_tokens_delete_own on public.device_tokens
  for delete to authenticated using (user_id = auth.uid());

-- Function privileges: deny by default, then allow what clients need.
revoke execute on all functions in schema private from public, anon, authenticated;
revoke execute on function public.try_uuid(text) from public;
grant execute on function public.try_uuid(text) to anon, authenticated, service_role;
grant execute on function public.username_available(text) to anon, authenticated;

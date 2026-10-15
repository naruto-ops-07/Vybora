-- =====================================================================
-- VYBORA · 0009 · Connect — end-to-end encrypted messaging (MLS, RFC 9420)
--
-- ADDITIVE ONLY. Existing feed/profiles/stories/legacy DMs are untouched,
-- except that plaintext `messages` can no longer be inserted into an
-- encrypted conversation.
--
-- The server stores ONLY public key material and ciphertext:
--   devices        — per-device Ed25519 identity public keys (directory)
--   key_packages   — one-time MLS KeyPackages (public), claimed atomically
--   mls_envelopes  — MLS commits + application messages (ciphertext)
--   mls_welcomes   — MLS Welcome messages addressed to a device (ciphertext)
-- Personal settings (mute, tone, nickname, pins) are owner-only rows.
-- Shared chat themes are a versioned, validated conversation record.
-- =====================================================================

-- ---------------------------------------------------------------------
-- User-level privacy & notification settings (extends user_settings)
-- ---------------------------------------------------------------------

alter table public.user_settings
  add column notifications_enabled boolean not null default true,
  add column read_receipts boolean not null default true,
  add column typing_indicators boolean not null default true,
  add column show_online boolean not null default true,
  add column message_previews boolean not null default false;

grant update (notifications_enabled, read_receipts, typing_indicators, show_online, message_previews)
  on public.user_settings to authenticated;

-- ---------------------------------------------------------------------
-- Devices (public key directory)
-- ---------------------------------------------------------------------

create table public.devices (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  platform      text not null check (platform in ('ios', 'android', 'web')),
  label         text not null default '' check (char_length(label) <= 60),
  identity_key  text not null unique check (identity_key ~ '^[A-Za-z0-9+/]{43}=$'),
  created_at    timestamptz not null default now(),
  last_seen_at  timestamptz not null default now(),
  revoked_at    timestamptz
);

create index devices_user_idx on public.devices (user_id, created_at);
create index devices_user_active_idx on public.devices (user_id) where revoked_at is null;

create or replace function private.devices_before_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.created_at := now();
    new.last_seen_at := now();
    new.revoked_at := null;
    if (select count(*) from public.devices d where d.user_id = new.user_id and d.revoked_at is null) >= 10 then
      raise exception 'too_many_devices' using errcode = 'P0001';
    end if;
  else
    if old.revoked_at is not null and new.revoked_at is distinct from old.revoked_at then
      raise exception 'device_revocation_is_permanent' using errcode = 'P0001';
    end if;
    if new.revoked_at is not null and old.revoked_at is null then
      new.revoked_at := now();
    end if;
  end if;
  return new;
end;
$$;

create trigger devices_before_write
  before insert or update on public.devices
  for each row execute function private.devices_before_write();

create trigger devices_rate_limit
  before insert on public.devices
  for each row execute function private.enforce_rate_limit('user_id', '1 hour', '20');

create or replace function private.devices_after_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    perform private.audit('connect.device_registered', 'device', new.id, jsonb_build_object('platform', new.platform));
  elsif new.revoked_at is not null and old.revoked_at is null then
    delete from public.key_packages where device_id = new.id and claimed_at is null;
    delete from public.mls_welcomes where device_id = new.id;
    perform private.audit('connect.device_revoked', 'device', new.id, '{}'::jsonb);
  end if;
  return new;
end;
$$;

create trigger devices_after_write
  after insert or update of revoked_at on public.devices
  for each row execute function private.devices_after_write();

-- ---------------------------------------------------------------------
-- One-time key packages
-- ---------------------------------------------------------------------

create table public.key_packages (
  id           uuid primary key default gen_random_uuid(),
  device_id    uuid not null references public.devices (id) on delete cascade,
  user_id      uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  key_package  text not null check (char_length(key_package) between 100 and 8000),
  created_at   timestamptz not null default now(),
  claimed_at   timestamptz,
  claimed_by   uuid references public.profiles (id) on delete set null
);

create index key_packages_available_idx on public.key_packages (device_id, created_at) where claimed_at is null;
create index key_packages_claimer_idx on public.key_packages (claimed_by, claimed_at) where claimed_at is not null;

create or replace function private.key_packages_before_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.created_at := now();
  new.claimed_at := null;
  new.claimed_by := null;
  if not exists (
    select 1 from public.devices d
    where d.id = new.device_id and d.user_id = new.user_id and d.revoked_at is null
  ) then
    raise exception 'device_not_active' using errcode = 'P0001';
  end if;
  if (select count(*) from public.key_packages k where k.device_id = new.device_id and k.claimed_at is null) >= 100 then
    raise exception 'too_many_key_packages' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger key_packages_before_insert
  before insert on public.key_packages
  for each row execute function private.key_packages_before_insert();

-- ---------------------------------------------------------------------
-- Conversations: encryption + group + shared theme metadata
-- ---------------------------------------------------------------------

alter table public.conversations drop constraint conversations_kind_check;
alter table public.conversations add constraint conversations_kind_check check (kind in ('direct', 'group'));

alter table public.conversations
  add column encrypted boolean not null default false,
  add column title text check (title is null or char_length(btrim(title)) between 1 and 80),
  add column avatar_path text check (avatar_path is null or char_length(avatar_path) <= 300),
  add column mls_epoch bigint not null default 0,
  add column last_seq bigint not null default 0,
  add column theme jsonb not null default '{}'::jsonb,
  add column theme_version integer not null default 0,
  add column theme_updated_by uuid references public.profiles (id) on delete set null,
  add column theme_updated_at timestamptz,
  add column settings_policy text not null default 'everyone' check (settings_policy in ('everyone', 'admins')),
  add column disappearing_seconds integer
    check (disappearing_seconds is null or disappearing_seconds between 30 and 2419200);

alter table public.conversation_members
  add column role text not null default 'member' check (role in ('admin', 'member')),
  add column joined_seq bigint not null default 0,
  add column delivered_seq bigint not null default 0,
  add column read_seq bigint not null default 0;

-- Plaintext legacy messages can never enter an encrypted conversation.
create or replace function private.messages_block_encrypted()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (select 1 from public.conversations c where c.id = new.conversation_id and c.encrypted) then
    raise exception 'conversation_is_encrypted' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger messages_block_encrypted
  before insert on public.messages
  for each row execute function private.messages_block_encrypted();

-- ---------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------

create or replace function public.owns_active_device(p_device uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.devices d
    where d.id = p_device and d.user_id = auth.uid() and d.revoked_at is null
  );
$$;

create or replace function public.conversation_role(p_conversation uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select m.role from public.conversation_members m
  where m.conversation_id = p_conversation and m.user_id = auth.uid();
$$;

create or replace function private.member_joined_seq(p_conversation uuid)
returns bigint
language sql
stable
security definer
set search_path = ''
as $$
  select m.joined_seq from public.conversation_members m
  where m.conversation_id = p_conversation and m.user_id = auth.uid();
$$;

create or replace function public.shares_conversation_with(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select auth.uid() is not null and exists (
    select 1
    from public.conversation_members a
    join public.conversation_members b on b.conversation_id = a.conversation_id
    where a.user_id = auth.uid() and b.user_id = p_user
  );
$$;

-- May the caller start a conversation with / add `p_user`?
create or replace function private.can_message(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_user <> auth.uid()
    and exists (select 1 from public.profiles p where p.id = p_user and p.status = 'active')
    and not exists (
      select 1 from public.blocks b
      where (b.blocker_id = auth.uid() and b.blocked_id = p_user)
         or (b.blocker_id = p_user and b.blocked_id = auth.uid())
    )
    and (
      coalesce((select s.message_privacy from public.user_settings s where s.user_id = p_user), 'everyone') = 'everyone'
      or exists (
        select 1 from public.follows f
        where f.follower_id = p_user and f.following_id = auth.uid() and f.status = 'accepted'
      )
    );
$$;

create or replace function private.require_settings_permission(p_conversation uuid)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_role text := public.conversation_role(p_conversation);
  v_policy text;
begin
  if v_role is null or not public.current_user_active() then
    raise exception 'not_a_member' using errcode = '42501';
  end if;
  select c.settings_policy into v_policy from public.conversations c where c.id = p_conversation;
  if v_policy = 'admins' and v_role <> 'admin' then
    raise exception 'admins_only' using errcode = '42501';
  end if;
  return v_role;
end;
$$;

-- ---------------------------------------------------------------------
-- Envelopes and welcomes
-- ---------------------------------------------------------------------

create table public.mls_envelopes (
  seq               bigint generated always as identity primary key,
  conversation_id   uuid not null references public.conversations (id) on delete cascade,
  sender_id         uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  sender_device_id  uuid references public.devices (id) on delete set null,
  epoch             bigint not null check (epoch >= 0),
  kind              text not null check (kind in ('commit', 'application')),
  ciphertext        text not null check (char_length(ciphertext) between 16 and 200000),
  client_id         uuid not null,
  attachment_paths  text[] not null default '{}' check (cardinality(attachment_paths) <= 10),
  created_at        timestamptz not null default now(),
  expires_at        timestamptz,
  unique (sender_device_id, client_id)
);

comment on column public.mls_envelopes.attachment_paths is
  'Opaque random object names only (no content/keys) so expired or deleted attachments can be removed from Storage.';

create index mls_envelopes_conversation_idx on public.mls_envelopes (conversation_id, seq);
create index mls_envelopes_expiry_idx on public.mls_envelopes (expires_at) where expires_at is not null;
create index mls_envelopes_sender_idx on public.mls_envelopes (sender_id, created_at desc);

create table public.mls_welcomes (
  id               uuid primary key default gen_random_uuid(),
  conversation_id  uuid not null references public.conversations (id) on delete cascade,
  device_id        uuid not null references public.devices (id) on delete cascade,
  epoch            bigint not null,
  commit_seq       bigint not null,
  welcome          text not null check (char_length(welcome) between 16 and 400000),
  created_at       timestamptz not null default now(),
  unique (conversation_id, device_id, epoch)
);

create index mls_welcomes_device_idx on public.mls_welcomes (device_id, conversation_id);

create trigger mls_envelopes_rate_limit
  before insert on public.mls_envelopes
  for each row execute function private.enforce_rate_limit('sender_id', '1 minute', '90');

-- Application messages must target the current epoch (forces clients to
-- process pending commits first, so groups can never fork).
create or replace function private.mls_envelopes_before_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_epoch bigint;
  v_encrypted boolean;
  v_ttl integer;
begin
  select c.mls_epoch, c.encrypted, c.disappearing_seconds into v_epoch, v_encrypted, v_ttl
  from public.conversations c where c.id = new.conversation_id;
  if not coalesce(v_encrypted, false) then
    raise exception 'conversation_not_encrypted' using errcode = 'P0001';
  end if;
  if new.kind = 'application' and new.epoch <> v_epoch then
    raise exception 'epoch_stale' using errcode = 'P0001', hint = format('server epoch %s', v_epoch);
  end if;
  new.created_at := now();
  new.expires_at := case when new.kind = 'application' and v_ttl is not null then now() + make_interval(secs => v_ttl) end;
  return new;
end;
$$;

create trigger mls_envelopes_before_insert
  before insert on public.mls_envelopes
  for each row execute function private.mls_envelopes_before_insert();

create or replace function private.mls_envelopes_after_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_member uuid;
begin
  update public.conversations
    set last_seq = greatest(last_seq, new.seq),
        last_message_at = case when new.kind = 'application' then new.created_at else last_message_at end
    where id = new.conversation_id;

  if new.kind = 'application' then
    -- Sender has read their own message on every device.
    insert into public.conversation_preferences (user_id, conversation_id, last_read_seq)
    values (new.sender_id, new.conversation_id, new.seq)
    on conflict (user_id, conversation_id) do update set last_read_seq = greatest(public.conversation_preferences.last_read_seq, excluded.last_read_seq);

    -- One unread "message" notification per conversation. NO content: the
    -- server cannot read messages, and previews would leak to push services.
    for v_member in
      select m.user_id from public.conversation_members m
      where m.conversation_id = new.conversation_id and m.user_id <> new.sender_id
    loop
      update public.notifications
        set created_at = now(), actor_id = new.sender_id, body = null
        where recipient_id = v_member and conversation_id = new.conversation_id and type = 'message' and read_at is null;
      if not found then
        perform private.notify(v_member, new.sender_id, 'message', null, null, new.conversation_id, null);
      end if;
    end loop;
  end if;
  return new;
end;
$$;

create trigger mls_envelopes_after_insert
  after insert on public.mls_envelopes
  for each row execute function private.mls_envelopes_after_insert();

create or replace function private.mls_envelopes_after_delete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_path text;
begin
  foreach v_path in array old.attachment_paths loop
    perform private.enqueue_media_deletion('connect', v_path, 'message_expired');
  end loop;
  return old;
end;
$$;

create trigger mls_envelopes_after_delete
  after delete on public.mls_envelopes
  for each row execute function private.mls_envelopes_after_delete();

-- ---------------------------------------------------------------------
-- Per-user conversation preferences (private to the owner)
-- ---------------------------------------------------------------------

create table public.conversation_preferences (
  user_id                uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  conversation_id        uuid not null references public.conversations (id) on delete cascade,
  notifications_enabled  boolean not null default true,
  muted_until            timestamptz,
  tone                   text not null default 'default'
                         check (tone in ('default', 'soft_chime', 'pop', 'bell', 'electronic', 'none')),
  pinned                 boolean not null default false,
  archived               boolean not null default false,
  last_read_seq          bigint not null default 0,
  cleared_before_seq     bigint not null default 0,
  local_theme            jsonb,
  use_local_theme        boolean not null default false,
  updated_at             timestamptz not null default now(),
  primary key (user_id, conversation_id)
);

create trigger conversation_preferences_updated_at
  before update on public.conversation_preferences
  for each row execute function private.set_updated_at();

-- Private nicknames: visible only to the person who set them.
create table public.contact_nicknames (
  owner_id    uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  contact_id  uuid not null references public.profiles (id) on delete cascade,
  nickname    text not null check (char_length(btrim(nickname)) between 1 and 40),
  updated_at  timestamptz not null default now(),
  primary key (owner_id, contact_id),
  check (owner_id <> contact_id)
);

-- Consent-based phone number (never public by default).
create table public.contact_methods (
  user_id     uuid primary key default auth.uid() references public.profiles (id) on delete cascade,
  phone_e164  text check (phone_e164 is null or phone_e164 ~ '^\+[1-9][0-9]{6,14}$'),
  visibility  text not null default 'nobody' check (visibility in ('nobody', 'contacts', 'everyone')),
  updated_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------

alter table public.devices                  enable row level security;
alter table public.key_packages             enable row level security;
alter table public.mls_envelopes            enable row level security;
alter table public.mls_welcomes             enable row level security;
alter table public.conversation_preferences enable row level security;
alter table public.contact_nicknames        enable row level security;
alter table public.contact_methods          enable row level security;

revoke all on public.devices, public.key_packages, public.mls_envelopes, public.mls_welcomes,
              public.conversation_preferences, public.contact_nicknames, public.contact_methods
  from anon, authenticated;

-- devices: the public-key directory is readable by signed-in users who are
-- not blocked (revoked devices stay listed, flagged, so old trees validate).
grant select, insert (user_id, platform, label, identity_key), update (label, last_seen_at, revoked_at)
  on public.devices to authenticated;
create policy devices_select on public.devices
  for select to authenticated
  using (user_id = auth.uid() or not public.is_blocked_with(user_id));
create policy devices_insert_own on public.devices
  for insert to authenticated
  with check (user_id = auth.uid() and public.current_user_active());
create policy devices_update_own on public.devices
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- key_packages: owners publish and count; others may only CLAIM via RPC.
grant select, insert (device_id, user_id, key_package), delete on public.key_packages to authenticated;
create policy key_packages_select_own on public.key_packages
  for select to authenticated using (user_id = auth.uid());
create policy key_packages_insert_own on public.key_packages
  for insert to authenticated with check (user_id = auth.uid());
create policy key_packages_delete_own on public.key_packages
  for delete to authenticated using (user_id = auth.uid());

-- mls_envelopes: members read ciphertext published after they joined.
grant select, insert (conversation_id, sender_id, sender_device_id, epoch, kind, ciphertext, client_id, attachment_paths)
  on public.mls_envelopes to authenticated;
create policy mls_envelopes_select_member on public.mls_envelopes
  for select to authenticated
  using (
    public.is_conversation_member(conversation_id)
    and seq > coalesce(private.member_joined_seq(conversation_id), 9223372036854775807)
    and (expires_at is null or expires_at > now())
  );
create policy mls_envelopes_insert_application on public.mls_envelopes
  for insert to authenticated
  with check (
    kind = 'application'
    and sender_id = auth.uid()
    and public.current_user_active()
    and public.is_conversation_member(conversation_id)
    and public.owns_active_device(sender_device_id)
  );

-- mls_welcomes: only the owner of the addressed device.
grant select, delete on public.mls_welcomes to authenticated;
create policy mls_welcomes_select_own_device on public.mls_welcomes
  for select to authenticated
  using (exists (select 1 from public.devices d where d.id = device_id and d.user_id = auth.uid()));
create policy mls_welcomes_delete_own_device on public.mls_welcomes
  for delete to authenticated
  using (exists (select 1 from public.devices d where d.id = device_id and d.user_id = auth.uid()));

-- preferences / nicknames / contact methods: owner only.
grant select, insert (user_id, conversation_id, notifications_enabled, muted_until, tone, pinned, archived,
                      last_read_seq, cleared_before_seq, local_theme, use_local_theme),
      update (notifications_enabled, muted_until, tone, pinned, archived, last_read_seq, cleared_before_seq,
              local_theme, use_local_theme),
      delete
  on public.conversation_preferences to authenticated;
create policy prefs_select_own on public.conversation_preferences
  for select to authenticated using (user_id = auth.uid());
create policy prefs_insert_own on public.conversation_preferences
  for insert to authenticated
  with check (user_id = auth.uid() and public.is_conversation_member(conversation_id));
create policy prefs_update_own on public.conversation_preferences
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy prefs_delete_own on public.conversation_preferences
  for delete to authenticated using (user_id = auth.uid());

grant select, insert (owner_id, contact_id, nickname), update (nickname), delete on public.contact_nicknames to authenticated;
create policy nicknames_select_own on public.contact_nicknames
  for select to authenticated using (owner_id = auth.uid());
create policy nicknames_insert_own on public.contact_nicknames
  for insert to authenticated with check (owner_id = auth.uid());
create policy nicknames_update_own on public.contact_nicknames
  for update to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy nicknames_delete_own on public.contact_nicknames
  for delete to authenticated using (owner_id = auth.uid());

grant select, insert (user_id, phone_e164, visibility), update (phone_e164, visibility), delete
  on public.contact_methods to authenticated;
create policy contact_methods_own on public.contact_methods
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ---------------------------------------------------------------------
-- RPCs
-- ---------------------------------------------------------------------

-- Atomically claim one unused key package per requested device (single use).
create or replace function public.claim_key_packages(p_device_ids uuid[])
returns table (device_id uuid, user_id uuid, key_package_id uuid, key_package text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_device uuid;
  v_owner uuid;
  v_kp_id uuid;
  v_kp_text text;
begin
  if not public.current_user_active() then
    raise exception 'account_inactive' using errcode = '42501';
  end if;
  if coalesce(cardinality(p_device_ids), 0) > 64 then
    raise exception 'too_many_devices_requested' using errcode = 'P0001';
  end if;
  if (select count(*) from public.key_packages k where k.claimed_by = auth.uid() and k.claimed_at > now() - interval '1 hour') > 500 then
    raise exception 'rate_limit_exceeded' using errcode = 'P0001';
  end if;

  foreach v_device in array coalesce((select array_agg(distinct x) from unnest(p_device_ids) x), '{}'::uuid[]) loop
    v_owner := null;
    v_kp_id := null;
    v_kp_text := null;
    select d.user_id into v_owner from public.devices d where d.id = v_device and d.revoked_at is null;
    if v_owner is null then
      continue;
    end if;
    -- Only claim for yourself, people you already share a conversation with,
    -- or people who accept messages from you (prevents key-package draining).
    if v_owner <> auth.uid() and not public.shares_conversation_with(v_owner) and not private.can_message(v_owner) then
      continue;
    end if;
    select k.id, k.key_package into v_kp_id, v_kp_text
    from public.key_packages k
    where k.device_id = v_device and k.claimed_at is null
    order by k.created_at
    limit 1
    for update skip locked;

    if v_kp_id is not null then
      update public.key_packages set claimed_at = now(), claimed_by = auth.uid() where id = v_kp_id;
    end if;
    device_id := v_device;
    user_id := v_owner;
    key_package_id := v_kp_id;
    key_package := v_kp_text;
    return next;
  end loop;
end;
$$;

-- Create an encrypted direct or group conversation (membership is server-controlled).
create or replace function public.create_secure_conversation(p_kind text, p_member_ids uuid[], p_title text default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := auth.uid();
  v_members uuid[];
  v_member uuid;
  v_key text;
  v_id uuid;
begin
  if v_me is null or not public.current_user_active() then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  select coalesce(array_agg(distinct m), '{}') into v_members from unnest(p_member_ids) m where m <> v_me;
  if p_kind = 'direct' and cardinality(v_members) <> 1 then
    raise exception 'direct_needs_one_member' using errcode = 'P0001';
  elsif p_kind = 'group' and cardinality(v_members) not between 1 and 254 then
    raise exception 'invalid_group_size' using errcode = 'P0001';
  elsif p_kind not in ('direct', 'group') then
    raise exception 'invalid_kind' using errcode = 'P0001';
  end if;

  foreach v_member in array v_members loop
    if not private.can_message(v_member) then
      raise exception 'cannot_message' using errcode = 'P0001', detail = v_member::text;
    end if;
  end loop;

  if p_kind = 'direct' then
    v_key := 'e2ee:' || least(v_me::text, v_members[1]::text) || ':' || greatest(v_me::text, v_members[1]::text);
    select c.id into v_id from public.conversations c where c.direct_key = v_key;
    if v_id is not null then
      return v_id;
    end if;
  end if;

  insert into public.conversations (kind, direct_key, created_by, encrypted, title)
  values (p_kind, v_key, v_me, true, case when p_kind = 'group' then nullif(btrim(coalesce(p_title, '')), '') end)
  on conflict (direct_key) do nothing
  returning id into v_id;
  if v_id is null then
    select c.id into v_id from public.conversations c where c.direct_key = v_key;
    return v_id;
  end if;

  insert into public.conversation_members (conversation_id, user_id, role)
  values (v_id, v_me, case when p_kind = 'group' then 'admin' else 'member' end);
  insert into public.conversation_members (conversation_id, user_id, role)
  select v_id, m, 'member' from unnest(v_members) m;

  perform private.audit('connect.conversation_created', 'conversation', v_id,
    jsonb_build_object('kind', p_kind, 'members', cardinality(v_members) + 1));
  return v_id;
end;
$$;

-- Publish an MLS commit (+ welcomes) for epoch p_epoch. Serialized per
-- conversation; exactly one commit can win each epoch.
create or replace function public.post_commit(
  p_conversation uuid,
  p_device uuid,
  p_epoch bigint,
  p_commit text,
  p_client_id uuid,
  p_welcomes jsonb default '[]'::jsonb
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_epoch bigint;
  v_seq bigint;
  v_w jsonb;
  v_device uuid;
begin
  if not public.is_conversation_member(p_conversation) or not public.current_user_active() then
    raise exception 'not_a_member' using errcode = '42501';
  end if;
  if not public.owns_active_device(p_device) then
    raise exception 'device_not_active' using errcode = '42501';
  end if;
  if jsonb_typeof(p_welcomes) <> 'array' or jsonb_array_length(p_welcomes) > 512 then
    raise exception 'invalid_welcomes' using errcode = 'P0001';
  end if;

  select e.seq into v_seq from public.mls_envelopes e where e.sender_device_id = p_device and e.client_id = p_client_id;
  if v_seq is not null then
    return v_seq; -- idempotent retry
  end if;

  select c.mls_epoch into v_epoch from public.conversations c where c.id = p_conversation and c.encrypted for update;
  if v_epoch is null then
    raise exception 'conversation_not_encrypted' using errcode = 'P0001';
  end if;
  if v_epoch <> p_epoch then
    raise exception 'epoch_conflict' using errcode = 'P0001', hint = format('server epoch %s', v_epoch);
  end if;

  insert into public.mls_envelopes (conversation_id, sender_id, sender_device_id, epoch, kind, ciphertext, client_id)
  values (p_conversation, auth.uid(), p_device, p_epoch, 'commit', p_commit, p_client_id)
  returning seq into v_seq;

  update public.conversations set mls_epoch = p_epoch + 1 where id = p_conversation;

  for v_w in select value from jsonb_array_elements(p_welcomes) loop
    v_device := public.try_uuid(v_w ->> 'device_id');
    -- Welcomes only for active devices of current members.
    if v_device is not null and exists (
      select 1 from public.devices d
      join public.conversation_members m on m.user_id = d.user_id and m.conversation_id = p_conversation
      where d.id = v_device and d.revoked_at is null
    ) then
      insert into public.mls_welcomes (conversation_id, device_id, epoch, commit_seq, welcome)
      values (p_conversation, v_device, p_epoch + 1, v_seq, v_w ->> 'welcome')
      on conflict (conversation_id, device_id, epoch) do nothing;
    end if;
  end loop;
  return v_seq;
end;
$$;

-- Delivery/read acknowledgement. Read position is always stored privately
-- (cross-device unread counts); it is shared with others only if the user
-- has read receipts enabled.
create or replace function public.ack_conversation(p_conversation uuid, p_delivered_seq bigint, p_read_seq bigint)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_last bigint;
  v_receipts boolean;
begin
  if not public.is_conversation_member(p_conversation) then
    raise exception 'not_a_member' using errcode = '42501';
  end if;
  select c.last_seq into v_last from public.conversations c where c.id = p_conversation;
  select coalesce(s.read_receipts, true) into v_receipts from public.user_settings s where s.user_id = auth.uid();

  update public.conversation_members
    set delivered_seq = greatest(delivered_seq, least(coalesce(p_delivered_seq, 0), v_last)),
        read_seq = case when coalesce(v_receipts, true) then greatest(read_seq, least(coalesce(p_read_seq, 0), v_last)) else read_seq end
    where conversation_id = p_conversation and user_id = auth.uid();

  if p_read_seq is not null and p_read_seq > 0 then
    insert into public.conversation_preferences (user_id, conversation_id, last_read_seq)
    values (auth.uid(), p_conversation, least(p_read_seq, v_last))
    on conflict (user_id, conversation_id)
      do update set last_read_seq = greatest(public.conversation_preferences.last_read_seq, excluded.last_read_seq);
    update public.notifications set read_at = now()
      where recipient_id = auth.uid() and conversation_id = p_conversation and type = 'message' and read_at is null;
  end if;
end;
$$;

-- Shared theme: versioned compare-and-set prevents update loops and lost writes.
create or replace function public.set_conversation_theme(p_conversation uuid, p_theme jsonb, p_expected_version integer)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_version integer;
begin
  perform private.require_settings_permission(p_conversation);
  if jsonb_typeof(p_theme) <> 'object'
     or exists (select 1 from jsonb_object_keys(p_theme) k where k not in ('preset', 'wallpaper', 'accent'))
     or coalesce(p_theme ->> 'preset', 'violet') not in ('violet', 'midnight', 'aurora', 'ember', 'ocean', 'forest', 'rose', 'mono')
     or (p_theme ? 'wallpaper' and jsonb_typeof(p_theme -> 'wallpaper') <> 'null'
         and (p_theme ->> 'wallpaper') not in ('none', 'nebula', 'waves', 'grid', 'bloom', 'dunes', 'stars'))
     or (p_theme ? 'accent' and jsonb_typeof(p_theme -> 'accent') <> 'null'
         and (p_theme ->> 'accent') !~ '^#[0-9A-Fa-f]{6}$') then
    raise exception 'invalid_theme' using errcode = 'P0001';
  end if;

  update public.conversations
    set theme = p_theme, theme_version = theme_version + 1, theme_updated_by = auth.uid(), theme_updated_at = now()
    where id = p_conversation and theme_version = p_expected_version
    returning theme_version into v_version;
  if v_version is null then
    raise exception 'theme_conflict' using errcode = 'P0001';
  end if;
  perform private.audit('connect.theme_changed', 'conversation', p_conversation, jsonb_build_object('version', v_version));
  return v_version;
end;
$$;

create or replace function public.set_disappearing_messages(p_conversation uuid, p_seconds integer)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_settings_permission(p_conversation);
  if p_seconds is not null and p_seconds not between 30 and 2419200 then
    raise exception 'invalid_duration' using errcode = 'P0001';
  end if;
  update public.conversations set disappearing_seconds = p_seconds where id = p_conversation;
end;
$$;

create or replace function public.update_group_info(p_conversation uuid, p_title text, p_avatar_path text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_settings_permission(p_conversation);
  if not exists (select 1 from public.conversations c where c.id = p_conversation and c.kind = 'group') then
    raise exception 'not_a_group' using errcode = 'P0001';
  end if;
  if p_avatar_path is not null and split_part(p_avatar_path, '/', 1) <> auth.uid()::text then
    raise exception 'avatar_path_not_owned' using errcode = 'P0001';
  end if;
  update public.conversations
    set title = nullif(btrim(coalesce(p_title, '')), ''), avatar_path = p_avatar_path
    where id = p_conversation;
end;
$$;

create or replace function public.set_group_policy(p_conversation uuid, p_policy text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if public.conversation_role(p_conversation) is distinct from 'admin' then
    raise exception 'admins_only' using errcode = '42501';
  end if;
  update public.conversations set settings_policy = p_policy where id = p_conversation and kind = 'group';
end;
$$;

create or replace function public.add_group_members(p_conversation uuid, p_user_ids uuid[])
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid;
  v_added integer := 0;
  v_last bigint;
begin
  perform private.require_settings_permission(p_conversation);
  select c.last_seq into v_last from public.conversations c where c.id = p_conversation and c.kind = 'group' and c.encrypted;
  if v_last is null then
    raise exception 'not_a_group' using errcode = 'P0001';
  end if;
  if (select count(*) from public.conversation_members m where m.conversation_id = p_conversation) + cardinality(p_user_ids) > 255 then
    raise exception 'invalid_group_size' using errcode = 'P0001';
  end if;
  foreach v_user in array p_user_ids loop
    if not private.can_message(v_user) then
      raise exception 'cannot_message' using errcode = 'P0001', detail = v_user::text;
    end if;
    -- New members can only read envelopes published after they were added.
    insert into public.conversation_members (conversation_id, user_id, role, joined_seq)
    values (p_conversation, v_user, 'member', v_last)
    on conflict do nothing;
    if found then
      v_added := v_added + 1;
    end if;
  end loop;
  perform private.audit('connect.members_added', 'conversation', p_conversation, jsonb_build_object('count', v_added));
  return v_added;
end;
$$;

-- Remove a member (admins) or leave (self). Remaining members' clients then
-- commit the MLS removal; RLS already cuts the removed user off.
create or replace function public.remove_group_member(p_conversation uuid, p_user uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role text := public.conversation_role(p_conversation);
begin
  if v_role is null then
    raise exception 'not_a_member' using errcode = '42501';
  end if;
  if p_user <> auth.uid() and v_role <> 'admin' then
    raise exception 'admins_only' using errcode = '42501';
  end if;
  if not exists (select 1 from public.conversations c where c.id = p_conversation and c.kind = 'group') then
    raise exception 'not_a_group' using errcode = 'P0001';
  end if;
  delete from public.conversation_members where conversation_id = p_conversation and user_id = p_user;
  delete from public.mls_welcomes w
    using public.devices d
    where w.device_id = d.id and d.user_id = p_user and w.conversation_id = p_conversation;
  -- Keep at least one admin.
  if not exists (select 1 from public.conversation_members m where m.conversation_id = p_conversation and m.role = 'admin') then
    update public.conversation_members set role = 'admin'
      where conversation_id = p_conversation
        and user_id = (select m.user_id from public.conversation_members m where m.conversation_id = p_conversation order by m.joined_at limit 1);
  end if;
  perform private.audit('connect.member_removed', 'conversation', p_conversation, jsonb_build_object('user', p_user));
end;
$$;

create or replace function public.set_member_role(p_conversation uuid, p_user uuid, p_role text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if public.conversation_role(p_conversation) is distinct from 'admin' then
    raise exception 'admins_only' using errcode = '42501';
  end if;
  if p_role not in ('admin', 'member') then
    raise exception 'invalid_role' using errcode = 'P0001';
  end if;
  update public.conversation_members set role = p_role where conversation_id = p_conversation and user_id = p_user;
  if not exists (select 1 from public.conversation_members m where m.conversation_id = p_conversation and m.role = 'admin') then
    raise exception 'group_needs_an_admin' using errcode = 'P0001';
  end if;
end;
$$;

-- Phone number per the owner's consent setting.
create or replace function public.get_contact_phone(p_user uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select c.phone_e164
  from public.contact_methods c
  where c.user_id = p_user
    and c.phone_e164 is not null
    and (
      p_user = auth.uid()
      or (
        not public.is_blocked_with(p_user)
        and (
          c.visibility = 'everyone'
          or (c.visibility = 'contacts' and (
            public.shares_conversation_with(p_user)
            or (exists (select 1 from public.follows f where f.follower_id = auth.uid() and f.following_id = p_user and f.status = 'accepted')
                and exists (select 1 from public.follows f where f.follower_id = p_user and f.following_id = auth.uid() and f.status = 'accepted'))
          ))
        )
      )
    );
$$;

-- Encrypted inbox: metadata + unread counts (never content).
create or replace function public.my_secure_conversations()
returns table (
  conversation_id uuid,
  kind text,
  title text,
  avatar_path text,
  last_message_at timestamptz,
  last_seq bigint,
  mls_epoch bigint,
  theme jsonb,
  theme_version integer,
  theme_updated_by uuid,
  disappearing_seconds integer,
  settings_policy text,
  my_role text,
  unread_count integer,
  pinned boolean,
  archived boolean,
  muted_until timestamptz,
  notifications_enabled boolean,
  tone text,
  last_read_seq bigint,
  cleared_before_seq bigint,
  local_theme jsonb,
  use_local_theme boolean,
  members jsonb
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    c.id, c.kind, c.title, c.avatar_path, c.last_message_at, c.last_seq, c.mls_epoch,
    c.theme, c.theme_version, c.theme_updated_by, c.disappearing_seconds, c.settings_policy,
    me.role,
    (
      select count(*)::integer from public.mls_envelopes e
      where e.conversation_id = c.id and e.kind = 'application' and e.sender_id <> auth.uid()
        and e.seq > greatest(coalesce(p.last_read_seq, 0), me.joined_seq)
    ),
    coalesce(p.pinned, false), coalesce(p.archived, false), p.muted_until,
    coalesce(p.notifications_enabled, true), coalesce(p.tone, 'default'),
    coalesce(p.last_read_seq, 0), coalesce(p.cleared_before_seq, 0), p.local_theme, coalesce(p.use_local_theme, false),
    coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', pr.id, 'username', pr.username, 'display_name', pr.display_name, 'avatar_path', pr.avatar_path,
        'role', m.role, 'delivered_seq', m.delivered_seq, 'read_seq', m.read_seq
      ) order by m.joined_at)
      from public.conversation_members m
      join public.profiles pr on pr.id = m.user_id
      where m.conversation_id = c.id
    ), '[]'::jsonb)
  from public.conversation_members me
  join public.conversations c on c.id = me.conversation_id and c.encrypted
  left join public.conversation_preferences p on p.user_id = auth.uid() and p.conversation_id = c.id
  where me.user_id = auth.uid()
  order by coalesce(p.pinned, false) desc, c.last_message_at desc
  limit 500;
$$;

-- Legacy plaintext inbox no longer lists encrypted conversations.
create or replace function public.my_conversations(
  p_before timestamptz default null,
  p_limit integer default 30
)
returns table (
  conversation_id uuid,
  last_message_at timestamptz,
  other_id uuid,
  other_username text,
  other_display_name text,
  other_avatar_path text,
  last_message_body text,
  last_message_sender uuid,
  last_message_has_attachment boolean,
  unread_count integer
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    c.id,
    c.last_message_at,
    o.id, o.username, o.display_name, o.avatar_path,
    lm.body, lm.sender_id, lm.attachment_path is not null,
    (
      select count(*)::integer from public.messages x
      where x.conversation_id = c.id and x.sender_id <> auth.uid() and x.created_at > me.last_read_at
    )
  from public.conversation_members me
  join public.conversations c on c.id = me.conversation_id and not c.encrypted
  left join lateral (
    select om.user_id from public.conversation_members om
    where om.conversation_id = c.id and om.user_id <> auth.uid()
    limit 1
  ) other on true
  left join public.profiles o on o.id = other.user_id
  left join lateral (
    select m.body, m.sender_id, m.attachment_path from public.messages m
    where m.conversation_id = c.id
    order by m.created_at desc, m.id desc
    limit 1
  ) lm on true
  where me.user_id = auth.uid()
    and (p_before is null or c.last_message_at < p_before)
  order by c.last_message_at desc
  limit least(greatest(coalesce(p_limit, 30), 1), 100);
$$;

-- Badge counts now include encrypted chats (muted chats excluded).
create or replace function public.unread_counts()
returns table (notifications integer, conversations integer)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    (select count(*)::integer from public.notifications n
      where n.recipient_id = auth.uid() and n.read_at is null and n.type <> 'message'),
    (select count(*)::integer from public.conversation_members me
      join public.conversations c on c.id = me.conversation_id
      left join public.conversation_preferences p on p.user_id = auth.uid() and p.conversation_id = c.id
      where me.user_id = auth.uid()
        and (p.muted_until is null or p.muted_until < now())
        and coalesce(p.archived, false) = false
        and (
          (not c.encrypted and exists (
            select 1 from public.messages m
            where m.conversation_id = me.conversation_id and m.sender_id <> auth.uid() and m.created_at > me.last_read_at))
          or (c.encrypted and exists (
            select 1 from public.mls_envelopes e
            where e.conversation_id = c.id and e.kind = 'application' and e.sender_id <> auth.uid()
              and e.seq > greatest(coalesce(p.last_read_seq, 0), me.joined_seq)))
        ));
$$;

-- Server-side push gating (used by the send-push function with the service role).
create or replace function public.should_push_message(p_recipient uuid, p_conversation uuid)
returns table (allowed boolean, tone text)
language sql
stable
security definer
set search_path = ''
as $$
  select
    coalesce(s.notifications_enabled, true) and coalesce(s.push_enabled, true)
      and coalesce(p.notifications_enabled, true)
      and (p.muted_until is null or p.muted_until < now()),
    coalesce(p.tone, 'default')
  from public.user_settings s
  left join public.conversation_preferences p on p.user_id = p_recipient and p.conversation_id = p_conversation
  where s.user_id = p_recipient;
$$;

-- Trusted cleanup of disappeared messages (service role only).
create or replace function public.purge_expired_envelopes()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  with gone as (
    delete from public.mls_envelopes where expires_at is not null and expires_at < now() returning 1
  )
  select count(*) into v_count from gone;
  return v_count;
end;
$$;

revoke execute on function public.should_push_message(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.purge_expired_envelopes() from public, anon, authenticated;
grant execute on function public.should_push_message(uuid, uuid) to service_role;
grant execute on function public.purge_expired_envelopes() to service_role;
revoke execute on function
  public.claim_key_packages(uuid[]),
  public.create_secure_conversation(text, uuid[], text),
  public.post_commit(uuid, uuid, bigint, text, uuid, jsonb),
  public.ack_conversation(uuid, bigint, bigint),
  public.set_conversation_theme(uuid, jsonb, integer),
  public.set_disappearing_messages(uuid, integer),
  public.update_group_info(uuid, text, text),
  public.set_group_policy(uuid, text),
  public.add_group_members(uuid, uuid[]),
  public.remove_group_member(uuid, uuid),
  public.set_member_role(uuid, uuid, text),
  public.get_contact_phone(uuid),
  public.my_secure_conversations()
from public, anon;

-- ---------------------------------------------------------------------
-- Storage: encrypted attachments (ciphertext only, private bucket)
-- ---------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('connect', 'connect', false, 27262976, array['application/octet-stream'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

create policy "connect: members read ciphertext"
  on storage.objects for select to authenticated
  using (bucket_id = 'connect' and public.is_conversation_member(public.try_uuid((storage.foldername(name))[1])));

create policy "connect: members upload to own folder"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'connect'
    and public.is_conversation_member(public.try_uuid((storage.foldername(name))[1]))
    and (storage.foldername(name))[2] = auth.uid()::text
    and public.current_user_active()
  );

create policy "connect: uploader delete"
  on storage.objects for delete to authenticated
  using (bucket_id = 'connect' and (storage.foldername(name))[2] = auth.uid()::text);

-- Orphan sweep also covers the connect bucket.
create or replace function public.find_orphan_media(p_older_than interval default interval '24 hours', p_limit integer default 500)
returns table (bucket_id text, name text)
language sql
stable
security definer
set search_path = ''
as $$
  select o.bucket_id, o.name
  from storage.objects o
  where o.created_at < now() - greatest(p_older_than, interval '1 hour')
    and (
      (o.bucket_id = 'media'
        and not exists (select 1 from public.post_media m where m.storage_path = o.name)
        and not exists (select 1 from public.stories s where s.storage_path = o.name))
      or (o.bucket_id = 'avatars'
        and not exists (select 1 from public.profiles p where p.avatar_path = o.name))
      or (o.bucket_id = 'dm'
        and not exists (select 1 from public.messages x where x.attachment_path = o.name))
      or (o.bucket_id = 'connect'
        and not exists (select 1 from public.mls_envelopes e where o.name = any (e.attachment_paths)))
    )
  order by o.created_at
  limit least(greatest(coalesce(p_limit, 500), 1), 5000);
$$;

revoke execute on function public.find_orphan_media(interval, integer) from public, anon, authenticated;
grant execute on function public.find_orphan_media(interval, integer) to service_role;

-- ---------------------------------------------------------------------
-- Realtime: durable changes + authorized ephemeral channels
-- ---------------------------------------------------------------------

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.mls_envelopes;
    alter publication supabase_realtime add table public.mls_welcomes;
    alter publication supabase_realtime add table public.conversations;
    alter publication supabase_realtime add table public.conversation_members;
  end if;
end;
$$;

-- Typing/presence use *private* Realtime channels. Topics:
--   connect:conv:<conversation_id>   members only (typing indicators)
--   connect:presence:<user_id>       the user + people who share a chat with them
do $$
begin
  if to_regclass('realtime.messages') is not null then
    execute $p$
      create policy "connect: conversation channel read" on realtime.messages
        for select to authenticated
        using (
          realtime.topic() like 'connect:conv:%'
          and public.is_conversation_member(public.try_uuid(substr(realtime.topic(), 14)))
        )
    $p$;
    execute $p$
      create policy "connect: conversation channel write" on realtime.messages
        for insert to authenticated
        with check (
          realtime.topic() like 'connect:conv:%'
          and public.is_conversation_member(public.try_uuid(substr(realtime.topic(), 14)))
        )
    $p$;
    execute $p$
      create policy "connect: presence read" on realtime.messages
        for select to authenticated
        using (
          realtime.topic() like 'connect:presence:%'
          and (
            public.try_uuid(substr(realtime.topic(), 18)) = auth.uid()
            or public.shares_conversation_with(public.try_uuid(substr(realtime.topic(), 18)))
          )
        )
    $p$;
    execute $p$
      create policy "connect: presence write own" on realtime.messages
        for insert to authenticated
        with check (
          realtime.topic() like 'connect:presence:%'
          and public.try_uuid(substr(realtime.topic(), 18)) = auth.uid()
        )
    $p$;
  end if;
end;
$$;

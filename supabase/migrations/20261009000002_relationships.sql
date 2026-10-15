-- =====================================================================
-- VYBORA · 0002 · Relationships: follows, follow requests, blocks, mutes
-- and the central visibility predicate used by every content policy.
-- =====================================================================

create table public.follows (
  follower_id   uuid not null references public.profiles (id) on delete cascade,
  following_id  uuid not null references public.profiles (id) on delete cascade,
  status        text not null default 'accepted' check (status in ('pending', 'accepted')),
  created_at    timestamptz not null default now(),
  accepted_at   timestamptz,
  primary key (follower_id, following_id),
  check (follower_id <> following_id)
);

create index follows_following_idx on public.follows (following_id, status, created_at desc);
create index follows_follower_idx on public.follows (follower_id, status, created_at desc);

create table public.blocks (
  blocker_id  uuid not null references public.profiles (id) on delete cascade,
  blocked_id  uuid not null references public.profiles (id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);

create index blocks_blocked_idx on public.blocks (blocked_id);

create table public.mutes (
  muter_id    uuid not null references public.profiles (id) on delete cascade,
  muted_id    uuid not null references public.profiles (id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (muter_id, muted_id),
  check (muter_id <> muted_id)
);

-- ---------------------------------------------------------------------
-- Visibility helpers
-- ---------------------------------------------------------------------

-- Internal: can `p_viewer` (may be null = anonymous) see content owned by `p_owner`?
create or replace function private.viewer_can_view_profile(p_viewer uuid, p_owner uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when p_viewer is not null and p_viewer = p_owner then true
    else exists (
      select 1
      from public.profiles o
      where o.id = p_owner
        and (
          exists (select 1 from public.user_roles r where r.user_id = p_viewer and r.role in ('admin', 'moderator'))
          or (
            o.status = 'active'
            and not exists (
              select 1 from public.blocks b
              where (b.blocker_id = p_owner and b.blocked_id = p_viewer)
                 or (b.blocker_id = p_viewer and b.blocked_id = p_owner)
            )
            and (
              not o.is_private
              or exists (
                select 1 from public.follows f
                where f.follower_id = p_viewer and f.following_id = p_owner and f.status = 'accepted'
              )
            )
          )
        )
    )
  end;
$$;

-- Public: can the *caller* see content owned by `p_owner`? (Used by RLS policies.)
create or replace function public.can_view_profile(p_owner uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.viewer_can_view_profile(auth.uid(), p_owner);
$$;

-- Is there a block in either direction between the caller and `p_other`?
create or replace function public.is_blocked_with(p_other uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select auth.uid() is not null and exists (
    select 1 from public.blocks b
    where (b.blocker_id = auth.uid() and b.blocked_id = p_other)
       or (b.blocker_id = p_other and b.blocked_id = auth.uid())
  );
$$;

-- Has `p_owner` blocked the caller? (Definer: the caller cannot read others' block rows.)
create or replace function public.has_blocked_me(p_owner uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select auth.uid() is not null and exists (
    select 1 from public.blocks b where b.blocker_id = p_owner and b.blocked_id = auth.uid()
  );
$$;

-- Profile rows: hidden from users the owner has blocked, and suspended
-- accounts are hidden from everyone except themselves and staff.
create policy profiles_select on public.profiles
  for select to anon, authenticated
  using (
    id = auth.uid()
    or public.is_staff()
    or (status = 'active' and not public.has_blocked_me(id))
  );

-- ---------------------------------------------------------------------
-- Notification helper (internal)
-- ---------------------------------------------------------------------

create or replace function private.notify(
  p_recipient uuid,
  p_actor uuid,
  p_type text,
  p_post uuid default null,
  p_comment uuid default null,
  p_conversation uuid default null,
  p_body text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_recipient is null or p_recipient = p_actor then
    return;
  end if;
  if p_actor is not null and exists (
    select 1 from public.blocks b
    where (b.blocker_id = p_recipient and b.blocked_id = p_actor)
       or (b.blocker_id = p_actor and b.blocked_id = p_recipient)
  ) then
    return;
  end if;
  insert into public.notifications (recipient_id, actor_id, type, post_id, comment_id, conversation_id, body)
  values (p_recipient, p_actor, p_type, p_post, p_comment, p_conversation, left(p_body, 500))
  on conflict do nothing;
end;
$$;

-- ---------------------------------------------------------------------
-- Follow lifecycle
-- ---------------------------------------------------------------------

create or replace function private.follows_before_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_private boolean;
  v_status text;
begin
  select p.is_private, p.status into v_private, v_status
  from public.profiles p where p.id = new.following_id;

  if v_status is distinct from 'active' then
    raise exception 'profile_unavailable' using errcode = 'P0001';
  end if;
  if exists (
    select 1 from public.blocks b
    where (b.blocker_id = new.following_id and b.blocked_id = new.follower_id)
       or (b.blocker_id = new.follower_id and b.blocked_id = new.following_id)
  ) then
    raise exception 'blocked' using errcode = 'P0001';
  end if;

  -- The server decides whether this is a request or an immediate follow.
  new.created_at := now();
  if v_private then
    new.status := 'pending';
    new.accepted_at := null;
  else
    new.status := 'accepted';
    new.accepted_at := now();
  end if;
  return new;
end;
$$;

create trigger follows_before_insert
  before insert on public.follows
  for each row execute function private.follows_before_insert();

create trigger follows_rate_limit
  before insert on public.follows
  for each row execute function private.enforce_rate_limit('follower_id', '1 hour', '200');

create or replace function private.follows_before_update()
returns trigger
language plpgsql
as $$
begin
  if old.status <> 'pending' or new.status <> 'accepted' then
    raise exception 'invalid_follow_transition' using errcode = 'P0001';
  end if;
  new.accepted_at := now();
  return new;
end;
$$;

create trigger follows_before_update
  before update on public.follows
  for each row execute function private.follows_before_update();

create or replace function private.follows_after_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if new.status = 'accepted' then
      update public.profiles set followers_count = followers_count + 1 where id = new.following_id;
      update public.profiles set following_count = following_count + 1 where id = new.follower_id;
      perform private.notify(new.following_id, new.follower_id, 'follow');
    else
      perform private.notify(new.following_id, new.follower_id, 'follow_request');
    end if;
    return new;
  elsif tg_op = 'UPDATE' then
    if old.status = 'pending' and new.status = 'accepted' then
      update public.profiles set followers_count = followers_count + 1 where id = new.following_id;
      update public.profiles set following_count = following_count + 1 where id = new.follower_id;
      delete from public.notifications
        where recipient_id = new.following_id and actor_id = new.follower_id and type = 'follow_request';
      perform private.notify(new.follower_id, new.following_id, 'follow_accept');
    end if;
    return new;
  else
    if old.status = 'accepted' then
      update public.profiles set followers_count = greatest(followers_count - 1, 0) where id = old.following_id;
      update public.profiles set following_count = greatest(following_count - 1, 0) where id = old.follower_id;
    end if;
    delete from public.notifications
      where recipient_id = old.following_id and actor_id = old.follower_id
        and type in ('follow', 'follow_request') and read_at is null;
    return old;
  end if;
end;
$$;

create trigger follows_after_change
  after insert or update or delete on public.follows
  for each row execute function private.follows_after_change();

-- Going public auto-approves pending requests.
create or replace function private.profiles_privacy_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.is_private and not new.is_private then
    update public.follows set status = 'accepted'
      where following_id = new.id and status = 'pending';
  end if;
  return new;
end;
$$;

create trigger profiles_privacy_change
  after update of is_private on public.profiles
  for each row execute function private.profiles_privacy_change();

-- Blocking severs follow relationships in both directions.
create or replace function private.blocks_after_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.follows
  where (follower_id = new.blocker_id and following_id = new.blocked_id)
     or (follower_id = new.blocked_id and following_id = new.blocker_id);
  return new;
end;
$$;

create trigger blocks_after_insert
  after insert on public.blocks
  for each row execute function private.blocks_after_insert();

-- ---------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------

alter table public.follows enable row level security;
alter table public.blocks  enable row level security;
alter table public.mutes   enable row level security;

revoke all on public.follows, public.blocks, public.mutes from anon, authenticated;

grant select on public.follows to anon, authenticated;
grant insert (follower_id, following_id), update (status), delete on public.follows to authenticated;

-- A follow edge is visible to its two parties, and otherwise only when the
-- caller may view BOTH profiles (so private accounts' graphs don't leak).
create policy follows_select on public.follows
  for select to anon, authenticated
  using (
    follower_id = auth.uid()
    or following_id = auth.uid()
    or (
      status = 'accepted'
      and public.can_view_profile(follower_id)
      and public.can_view_profile(following_id)
    )
  );

create policy follows_insert_self on public.follows
  for insert to authenticated
  with check (follower_id = auth.uid() and public.current_user_active());

-- Only the followed account may accept a pending request.
create policy follows_accept on public.follows
  for update to authenticated
  using (following_id = auth.uid())
  with check (following_id = auth.uid());

-- Unfollow / cancel request (follower) or remove follower / reject (followed).
create policy follows_delete on public.follows
  for delete to authenticated
  using (follower_id = auth.uid() or following_id = auth.uid());

grant select, insert (blocker_id, blocked_id), delete on public.blocks to authenticated;
create policy blocks_select_own on public.blocks
  for select to authenticated using (blocker_id = auth.uid());
create policy blocks_insert_own on public.blocks
  for insert to authenticated with check (blocker_id = auth.uid());
create policy blocks_delete_own on public.blocks
  for delete to authenticated using (blocker_id = auth.uid());

grant select, insert (muter_id, muted_id), delete on public.mutes to authenticated;
create policy mutes_select_own on public.mutes
  for select to authenticated using (muter_id = auth.uid());
create policy mutes_insert_own on public.mutes
  for insert to authenticated with check (muter_id = auth.uid());
create policy mutes_delete_own on public.mutes
  for delete to authenticated using (muter_id = auth.uid());

-- ---------------------------------------------------------------------
-- Profile read model: profile + relationship to the caller, in one call.
-- ---------------------------------------------------------------------

create or replace function public.get_profile(p_username text)
returns table (
  id uuid,
  username text,
  display_name text,
  bio text,
  website text,
  avatar_path text,
  is_private boolean,
  status text,
  posts_count integer,
  followers_count integer,
  following_count integer,
  created_at timestamptz,
  is_me boolean,
  follow_status text,
  follows_me boolean,
  blocked_by_me boolean,
  muted_by_me boolean,
  can_view_content boolean
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    p.id, p.username, p.display_name, p.bio, p.website, p.avatar_path, p.is_private, p.status,
    p.posts_count, p.followers_count, p.following_count, p.created_at,
    p.id = auth.uid() as is_me,
    (select f.status from public.follows f where f.follower_id = auth.uid() and f.following_id = p.id) as follow_status,
    exists (select 1 from public.follows f where f.follower_id = p.id and f.following_id = auth.uid() and f.status = 'accepted') as follows_me,
    exists (select 1 from public.blocks b where b.blocker_id = auth.uid() and b.blocked_id = p.id) as blocked_by_me,
    exists (select 1 from public.mutes m where m.muter_id = auth.uid() and m.muted_id = p.id) as muted_by_me,
    public.can_view_profile(p.id) as can_view_content
  from public.profiles p
  where p.username = lower(p_username);
$$;

-- Followers / following lists with keyset pagination on (created_at, id).
create or replace function public.list_follows(
  p_user uuid,
  p_direction text,
  p_before_created timestamptz default null,
  p_before_id uuid default null,
  p_limit integer default 30
)
returns table (
  id uuid,
  username text,
  display_name text,
  avatar_path text,
  is_private boolean,
  followed_at timestamptz
)
language sql
stable
security invoker
set search_path = ''
as $$
  select p.id, p.username, p.display_name, p.avatar_path, p.is_private, f.created_at as followed_at
  from public.follows f
  join public.profiles p
    on p.id = case when p_direction = 'followers' then f.follower_id else f.following_id end
  where f.status = 'accepted'
    and p_direction in ('followers', 'following')
    and (case when p_direction = 'followers' then f.following_id else f.follower_id end) = p_user
    and public.can_view_profile(p_user)
    and (p_before_created is null or (f.created_at, p.id) < (p_before_created, p_before_id))
  order by f.created_at desc, p.id desc
  limit least(greatest(coalesce(p_limit, 30), 1), 100);
$$;

-- Incoming follow requests for the caller.
create or replace function public.list_follow_requests()
returns table (
  id uuid,
  username text,
  display_name text,
  avatar_path text,
  requested_at timestamptz
)
language sql
stable
security invoker
set search_path = ''
as $$
  select p.id, p.username, p.display_name, p.avatar_path, f.created_at
  from public.follows f
  join public.profiles p on p.id = f.follower_id
  where f.following_id = auth.uid() and f.status = 'pending'
  order by f.created_at desc
  limit 200;
$$;

-- Account search: prefix match on username / display name.
create or replace function public.search_profiles(p_query text, p_limit integer default 20)
returns table (
  id uuid,
  username text,
  display_name text,
  avatar_path text,
  is_private boolean,
  followers_count integer
)
language sql
stable
security invoker
set search_path = ''
as $$
  with q as (
    select lower(trim(both '@' from trim(coalesce(p_query, '')))) as term
  )
  select p.id, p.username, p.display_name, p.avatar_path, p.is_private, p.followers_count
  from public.profiles p, q
  where char_length(q.term) >= 1
    and p.status = 'active'
    and not public.is_blocked_with(p.id)
    and (
      p.username like replace(replace(replace(q.term, '\', '\\'), '%', '\%'), '_', '\_') || '%'
      or lower(p.display_name) like replace(replace(replace(q.term, '\', '\\'), '%', '\%'), '_', '\_') || '%'
    )
  order by (p.username = q.term) desc, p.followers_count desc, p.username
  limit least(greatest(coalesce(p_limit, 20), 1), 50);
$$;

-- Suggested accounts: transparent rule — popular public accounts the caller
-- does not already follow, excluding blocked and muted users.
create or replace function public.suggested_profiles(p_limit integer default 10)
returns table (
  id uuid,
  username text,
  display_name text,
  avatar_path text,
  followers_count integer,
  posts_count integer
)
language sql
stable
security invoker
set search_path = ''
as $$
  select p.id, p.username, p.display_name, p.avatar_path, p.followers_count, p.posts_count
  from public.profiles p
  where p.status = 'active'
    and not p.is_private
    and p.id <> coalesce(auth.uid(), '00000000-0000-0000-0000-000000000000'::uuid)
    and not public.is_blocked_with(p.id)
    and not exists (select 1 from public.follows f where f.follower_id = auth.uid() and f.following_id = p.id)
    and not exists (select 1 from public.mutes m where m.muter_id = auth.uid() and m.muted_id = p.id)
  order by p.followers_count desc, p.posts_count desc, p.created_at desc
  limit least(greatest(coalesce(p_limit, 10), 1), 30);
$$;

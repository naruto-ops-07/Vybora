-- VYBORA Connect: friends by username (additive).
--
-- Requests and friendships live in tables with no client grants: every read
-- and write goes through the security-definer functions below, which always
-- act as auth.uid(). Unknown, inactive and blocked usernames are
-- indistinguishable ("user_not_found") so block status never leaks.

create table public.friend_requests (
  requester_id uuid not null references public.profiles (id) on delete cascade,
  addressee_id uuid not null references public.profiles (id) on delete cascade,
  created_at   timestamptz not null default now(),
  primary key (requester_id, addressee_id),
  check (requester_id <> addressee_id)
);

create index friend_requests_addressee_idx
  on public.friend_requests (addressee_id, created_at desc);

-- One row per pair, stored ordered (user_low < user_high).
create table public.friendships (
  user_low   uuid not null references public.profiles (id) on delete cascade,
  user_high  uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_low, user_high),
  check (user_low < user_high)
);

create index friendships_high_idx on public.friendships (user_high);

alter table public.friend_requests enable row level security;
alter table public.friendships enable row level security;
revoke all on table public.friend_requests from public, anon, authenticated;
revoke all on table public.friendships from public, anon, authenticated;

-- "Who can start chats with me": add 'friends' (existing values stay valid).
alter table public.user_settings
  drop constraint if exists user_settings_message_privacy_check;
alter table public.user_settings
  add constraint user_settings_message_privacy_check
  check (message_privacy in ('everyone', 'following', 'friends'));

-- ---------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------

create or replace function public.are_friends(p_user uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  return exists (
    select 1 from public.friendships f
    where f.user_low = least(auth.uid(), p_user)
      and f.user_high = greatest(auth.uid(), p_user)
  );
end;
$$;

-- Blocking someone ends any friendship and pending request between the pair.
create or replace function private.blocks_clear_friends()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.friendships
  where user_low = least(new.blocker_id, new.blocked_id)
    and user_high = greatest(new.blocker_id, new.blocked_id);
  delete from public.friend_requests
  where (requester_id = new.blocker_id and addressee_id = new.blocked_id)
     or (requester_id = new.blocked_id and addressee_id = new.blocker_id);
  return new;
end;
$$;

create trigger blocks_clear_friends
  after insert on public.blocks
  for each row execute function private.blocks_clear_friends();

-- Same as 0009, plus a 'friends' value. The recipient's setting is read once
-- and each value admits exactly one kind of sender: everyone -> anyone,
-- following -> people the recipient follows (legacy), friends -> friends only.
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
      case coalesce((select s.message_privacy from public.user_settings s where s.user_id = p_user), 'everyone')
        when 'everyone' then true
        when 'following' then exists (
          select 1 from public.follows f
          where f.follower_id = p_user and f.following_id = auth.uid() and f.status = 'accepted'
        )
        when 'friends' then exists (
          select 1 from public.friendships fr
          where fr.user_low = least(auth.uid(), p_user)
            and fr.user_high = greatest(auth.uid(), p_user)
        )
        else false
      end
    );
$$;

-- ---------------------------------------------------------------------
-- Requests
-- ---------------------------------------------------------------------

-- Returns 'sent' | 'accepted' | 'already_friends' | 'already_sent'.
create or replace function public.send_friend_request(p_username text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := auth.uid();
  v_name text;
  v_target uuid;
begin
  if v_me is null or not public.current_user_active() then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;

  v_name := lower(btrim(coalesce(p_username, '')));
  if left(v_name, 1) = '@' then
    v_name := substr(v_name, 2);
  end if;

  select p.id into v_target
  from public.profiles p
  where p.username = v_name and p.status = 'active';

  -- Unknown, inactive and blocked (either way) all look the same.
  if v_target is null or exists (
    select 1 from public.blocks b
    where (b.blocker_id = v_me and b.blocked_id = v_target)
       or (b.blocker_id = v_target and b.blocked_id = v_me)
  ) then
    raise exception 'user_not_found' using errcode = 'P0002';
  end if;
  if v_target = v_me then
    raise exception 'cannot_add_self' using errcode = 'P0001';
  end if;

  if exists (
    select 1 from public.friendships f
    where f.user_low = least(v_me, v_target) and f.user_high = greatest(v_me, v_target)
  ) then
    return 'already_friends';
  end if;

  -- They already asked me: adding them accepts it.
  if exists (
    select 1 from public.friend_requests r
    where r.requester_id = v_target and r.addressee_id = v_me
  ) then
    insert into public.friendships (user_low, user_high)
    values (least(v_me, v_target), greatest(v_me, v_target))
    on conflict do nothing;
    delete from public.friend_requests r
    where r.requester_id = v_target and r.addressee_id = v_me;
    return 'accepted';
  end if;

  if exists (
    select 1 from public.friend_requests r
    where r.requester_id = v_me and r.addressee_id = v_target
  ) then
    return 'already_sent';
  end if;

  if (select count(*) from public.friend_requests r where r.requester_id = v_me) >= 100 then
    raise exception 'too_many_requests' using errcode = 'P0001';
  end if;

  insert into public.friend_requests (requester_id, addressee_id)
  values (v_me, v_target)
  on conflict do nothing;
  return 'sent';
end;
$$;

create or replace function public.respond_friend_request(p_requester uuid, p_accept boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := auth.uid();
  v_deleted integer;
begin
  if v_me is null or not public.current_user_active() then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;

  delete from public.friend_requests r
  where r.requester_id = p_requester and r.addressee_id = v_me;
  get diagnostics v_deleted = row_count;
  if v_deleted = 0 then
    raise exception 'request_not_found' using errcode = 'P0002';
  end if;

  if coalesce(p_accept, false) then
    -- A block (either way) means the request is stale and must look exactly
    -- like a missing one. (Raising rolls the delete back; the blocks trigger
    -- already clears requests, and the lists hide blocked pairs regardless.)
    if exists (
      select 1 from public.blocks b
      where (b.blocker_id = v_me and b.blocked_id = p_requester)
         or (b.blocker_id = p_requester and b.blocked_id = v_me)
    ) then
      raise exception 'request_not_found' using errcode = 'P0002';
    end if;
    insert into public.friendships (user_low, user_high)
    values (least(v_me, p_requester), greatest(v_me, p_requester))
    on conflict do nothing;
    -- Both of us asked at once: the reverse request is now moot.
    delete from public.friend_requests r
    where r.requester_id = v_me and r.addressee_id = p_requester;
  end if;
end;
$$;

create or replace function public.cancel_friend_request(p_addressee uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  delete from public.friend_requests r
  where r.requester_id = auth.uid() and r.addressee_id = p_addressee;
end;
$$;

create or replace function public.remove_friend(p_friend uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  delete from public.friendships f
  where f.user_low = least(auth.uid(), p_friend)
    and f.user_high = greatest(auth.uid(), p_friend);
end;
$$;

-- ---------------------------------------------------------------------
-- Lists
-- ---------------------------------------------------------------------

create or replace function public.my_friends()
returns table (
  user_id uuid,
  username text,
  display_name text,
  avatar_path text,
  since timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
begin
  if auth.uid() is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  return query
    select p.id, p.username, p.display_name, p.avatar_path, f.created_at
    from public.friendships f
    join public.profiles p
      on p.id = case when f.user_low = auth.uid() then f.user_high else f.user_low end
    where (f.user_low = auth.uid() or f.user_high = auth.uid())
      and p.status = 'active'
      and not exists (
        select 1 from public.blocks b
        where (b.blocker_id = auth.uid() and b.blocked_id = p.id)
           or (b.blocker_id = p.id and b.blocked_id = auth.uid())
      )
    order by lower(coalesce(nullif(p.display_name, ''), p.username)), p.username;
end;
$$;

create or replace function public.my_friend_requests()
returns table (
  direction text,
  user_id uuid,
  username text,
  display_name text,
  avatar_path text,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
begin
  if auth.uid() is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  return query
    select case when r.addressee_id = auth.uid() then 'incoming' else 'outgoing' end,
           p.id, p.username, p.display_name, p.avatar_path, r.created_at
    from public.friend_requests r
    join public.profiles p
      on p.id = case when r.addressee_id = auth.uid() then r.requester_id else r.addressee_id end
    where (r.requester_id = auth.uid() or r.addressee_id = auth.uid())
      and p.status = 'active'
      and not exists (
        select 1 from public.blocks b
        where (b.blocker_id = auth.uid() and b.blocked_id = p.id)
           or (b.blocker_id = p.id and b.blocked_id = auth.uid())
      )
    order by r.created_at desc;
end;
$$;

revoke execute on function public.are_friends(uuid) from public, anon;
revoke execute on function public.send_friend_request(text) from public, anon;
revoke execute on function public.respond_friend_request(uuid, boolean) from public, anon;
revoke execute on function public.cancel_friend_request(uuid) from public, anon;
revoke execute on function public.remove_friend(uuid) from public, anon;
revoke execute on function public.my_friends() from public, anon;
revoke execute on function public.my_friend_requests() from public, anon;
grant execute on function public.are_friends(uuid) to authenticated;
grant execute on function public.send_friend_request(text) to authenticated;
grant execute on function public.respond_friend_request(uuid, boolean) to authenticated;
grant execute on function public.cancel_friend_request(uuid) to authenticated;
grant execute on function public.remove_friend(uuid) to authenticated;
grant execute on function public.my_friends() to authenticated;
grant execute on function public.my_friend_requests() to authenticated;

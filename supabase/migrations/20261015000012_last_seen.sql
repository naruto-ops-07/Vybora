-- VYBORA Connect: "last seen" (additive).
--
-- Activity lives in its own table with no client grants: only the two
-- functions below touch it, so it never leaks through profiles or devices
-- (see 0010, which hid device last_seen_at for the same reason).
--
-- Rules for last_seen():
--   * the caller shares a chat with the target,
--   * the target shows online status,
--   * the caller shows online status too (reciprocal),
--   * neither has blocked the other,
--   * minute precision, at most 100 ids per call.

create table public.user_activity (
  user_id        uuid primary key references public.profiles (id) on delete cascade,
  last_active_at timestamptz not null default now()
);

alter table public.user_activity enable row level security;
revoke all on table public.user_activity from public, anon, authenticated;

create or replace function public.touch_activity()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  insert into public.user_activity as ua (user_id, last_active_at)
  values (auth.uid(), now())
  on conflict (user_id) do update
    set last_active_at = excluded.last_active_at
    where ua.last_active_at < now() - interval '60 seconds';
end;
$$;

create or replace function public.caller_shows_online()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select s.show_online from public.user_settings s where s.user_id = auth.uid()),
    false
  );
$$;

-- Block check for policies: RLS on public.blocks hides the other party's rows
-- from the caller, so this must read it as the definer.
create or replace function public.caller_blocked_with(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.blocks b
    where (b.blocker_id = auth.uid() and b.blocked_id = p_user)
       or (b.blocker_id = p_user and b.blocked_id = auth.uid())
  );
$$;

create or replace function public.last_seen(p_user_ids uuid[])
returns table (user_id uuid, last_active_at timestamptz)
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
  -- cardinality() counts every element; array_length(.., 1) would only see the
  -- first dimension of a nested array and let a 2-D array slip past the cap.
  if coalesce(array_ndims(p_user_ids), 1) > 1 then
    raise exception 'invalid_user_ids' using errcode = '22023';
  end if;
  if coalesce(cardinality(p_user_ids), 0) > 100 then
    raise exception 'too_many_users' using errcode = '22023';
  end if;
  if not public.caller_shows_online() then
    return;
  end if;
  return query
    select a.user_id, date_trunc('minute', a.last_active_at)
    from public.user_activity a
    join public.user_settings t on t.user_id = a.user_id and t.show_online
    where a.user_id = any (p_user_ids)
      and a.user_id <> auth.uid()
      and public.shares_conversation_with(a.user_id)
      and not exists (
        select 1 from public.blocks b
        where (b.blocker_id = auth.uid() and b.blocked_id = a.user_id)
           or (b.blocker_id = a.user_id and b.blocked_id = auth.uid())
      );
end;
$$;

revoke execute on function public.touch_activity() from public, anon;
revoke execute on function public.caller_shows_online() from public, anon;
revoke execute on function public.caller_blocked_with(uuid) from public, anon;
revoke execute on function public.last_seen(uuid[]) from public, anon;
grant execute on function public.touch_activity() to authenticated;
grant execute on function public.caller_shows_online() to authenticated;
grant execute on function public.caller_blocked_with(uuid) to authenticated;
grant execute on function public.last_seen(uuid[]) to authenticated;

-- Presence is reciprocal too: you can read others' presence only while your
-- own "show when I'm online" is on and no block exists either way. Your own
-- topic stays readable.
do $$
begin
  if to_regclass('realtime.messages') is not null then
    execute 'drop policy if exists "connect: presence read" on realtime.messages';
    execute $p$
      create policy "connect: presence read" on realtime.messages
        for select to authenticated
        using (
          realtime.topic() like 'connect:presence:%'
          and (
            public.try_uuid(substr(realtime.topic(), 18)) = auth.uid()
            or (
              public.shares_conversation_with(public.try_uuid(substr(realtime.topic(), 18)))
              and public.caller_shows_online()
              and not public.caller_blocked_with(public.try_uuid(substr(realtime.topic(), 18)))
            )
          )
        )
    $p$;
  end if;
end;
$$;

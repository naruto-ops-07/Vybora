-- =====================================================================
-- VYBORA · 0004 · Stories
-- Expiry is set by the server (now() + 24h) and enforced in RLS; clients
-- cannot choose or extend it. Expired rows are purged by a trusted job.
-- =====================================================================

create table public.stories (
  id            uuid primary key default gen_random_uuid(),
  author_id     uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  storage_path  text not null unique check (char_length(storage_path) <= 300),
  media_type    text not null check (media_type in ('image', 'video')),
  mime_type     text not null check (mime_type in (
                  'image/jpeg', 'image/png', 'image/webp', 'image/gif',
                  'video/mp4', 'video/quicktime', 'video/webm')),
  width         integer check (width is null or width between 1 and 10000),
  height        integer check (height is null or height between 1 and 10000),
  duration_ms   integer check (duration_ms is null or duration_ms between 0 and 60000),
  created_at    timestamptz not null default now(),
  expires_at    timestamptz not null default now() + interval '24 hours',
  check ((media_type = 'image') = (mime_type like 'image/%')),
  check (expires_at > created_at and expires_at <= created_at + interval '48 hours')
);

create index stories_author_active_idx on public.stories (author_id, created_at);
create index stories_expires_idx on public.stories (expires_at);

create table public.story_views (
  story_id   uuid not null references public.stories (id) on delete cascade,
  viewer_id  uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  viewed_at  timestamptz not null default now(),
  primary key (story_id, viewer_id)
);

create index story_views_viewer_idx on public.story_views (viewer_id);

create trigger stories_rate_limit
  before insert on public.stories
  for each row execute function private.enforce_rate_limit('author_id', '24 hours', '100');

create or replace function private.stories_before_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_meta jsonb;
begin
  new.created_at := now();
  new.expires_at := now() + interval '24 hours';
  if split_part(new.storage_path, '/', 1) <> new.author_id::text then
    raise exception 'media_path_not_owned' using errcode = 'P0001';
  end if;
  select o.metadata into v_meta
  from storage.objects o
  where o.bucket_id = 'media' and o.name = new.storage_path;
  if not found then
    raise exception 'media_not_uploaded' using errcode = 'P0001';
  end if;
  if v_meta ->> 'mimetype' is not null and v_meta ->> 'mimetype' <> new.mime_type then
    raise exception 'media_type_mismatch' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger stories_before_insert
  before insert on public.stories
  for each row execute function private.stories_before_insert();

create or replace function private.stories_after_delete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.enqueue_media_deletion('media', old.storage_path, 'story_deleted');
  return old;
end;
$$;

create trigger stories_after_delete
  after delete on public.stories
  for each row execute function private.stories_after_delete();

-- Viewers can only record a view of a story they can currently see; the
-- author's own views are not recorded.
create or replace function private.story_views_before_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.viewed_at := now();
  return new;
end;
$$;

create trigger story_views_before_insert
  before insert on public.story_views
  for each row execute function private.story_views_before_insert();

create or replace function public.can_view_story(p_story uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.stories s
    where s.id = p_story
      and s.expires_at > now()
      and private.viewer_can_view_profile(auth.uid(), s.author_id)
  );
$$;

create or replace function public.is_story_author(p_story uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.stories s where s.id = p_story and s.author_id = auth.uid());
$$;

alter table public.stories     enable row level security;
alter table public.story_views enable row level security;

revoke all on public.stories, public.story_views from anon, authenticated;

grant select on public.stories to anon, authenticated;
grant insert (author_id, storage_path, media_type, mime_type, width, height, duration_ms), delete
  on public.stories to authenticated;

-- Expired stories are invisible to everyone through normal queries.
create policy stories_select on public.stories
  for select to anon, authenticated
  using (expires_at > now() and public.can_view_profile(author_id));
create policy stories_insert_own on public.stories
  for insert to authenticated
  with check (author_id = auth.uid() and public.current_user_active());
create policy stories_delete_own on public.stories
  for delete to authenticated
  using (author_id = auth.uid());

grant select, insert (story_id, viewer_id) on public.story_views to authenticated;

-- Viewer lists are visible only to the story's author (and each viewer sees their own rows).
create policy story_views_select on public.story_views
  for select to authenticated
  using (viewer_id = auth.uid() or public.is_story_author(story_id));
create policy story_views_insert_own on public.story_views
  for insert to authenticated
  with check (
    viewer_id = auth.uid()
    and public.can_view_story(story_id)
    and not public.is_story_author(story_id)
  );

-- ---------------------------------------------------------------------
-- Story tray: one row per author with active stories visible to the caller
-- (yourself + accounts you follow), unseen first.
-- ---------------------------------------------------------------------

create or replace function public.story_tray()
returns table (
  author_id uuid,
  username text,
  display_name text,
  avatar_path text,
  story_count integer,
  latest_at timestamptz,
  has_unseen boolean,
  is_me boolean
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    p.id, p.username, p.display_name, p.avatar_path,
    count(s.id)::integer,
    max(s.created_at),
    bool_or(not exists (
      select 1 from public.story_views v where v.story_id = s.id and v.viewer_id = auth.uid()
    )) and p.id <> auth.uid(),
    p.id = auth.uid()
  from public.stories s
  join public.profiles p on p.id = s.author_id
  where s.expires_at > now()
    and (
      s.author_id = auth.uid()
      or s.author_id in (
        select f.following_id from public.follows f
        where f.follower_id = auth.uid() and f.status = 'accepted'
      )
    )
    and not exists (select 1 from public.mutes m where m.muter_id = auth.uid() and m.muted_id = s.author_id)
  group by p.id
  order by (p.id = auth.uid()) desc, 7 desc, max(s.created_at) desc
  limit 100;
$$;

-- Viewer list for one of the caller's stories.
create or replace function public.story_viewers(p_story uuid)
returns table (viewer_id uuid, username text, display_name text, avatar_path text, viewed_at timestamptz)
language sql
stable
security invoker
set search_path = ''
as $$
  select p.id, p.username, p.display_name, p.avatar_path, v.viewed_at
  from public.story_views v
  join public.profiles p on p.id = v.viewer_id
  where v.story_id = p_story and public.is_story_author(p_story)
  order by v.viewed_at desc
  limit 500;
$$;

-- ---------------------------------------------------------------------
-- Trusted cleanup (service role only). Grace period protects stories that
-- are still being viewed; media deletion is queued, never done inline.
-- ---------------------------------------------------------------------

create or replace function public.purge_expired_stories(p_grace interval default interval '1 hour')
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  if p_grace < interval '0' then
    raise exception 'invalid_grace' using errcode = 'P0001';
  end if;
  with deleted as (
    delete from public.stories where expires_at < now() - p_grace returning 1
  )
  select count(*) into v_count from deleted;
  return v_count;
end;
$$;

revoke execute on function public.purge_expired_stories(interval) from public, anon, authenticated;
grant execute on function public.purge_expired_stories(interval) to service_role;

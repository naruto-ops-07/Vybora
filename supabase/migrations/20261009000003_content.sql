-- =====================================================================
-- VYBORA Â· 0003 Â· Content: posts, media, likes, comments, saves, hashtags
-- plus feed read models with keyset (cursor) pagination.
-- Binary media lives in Storage; rows store only paths + metadata.
-- =====================================================================

create table public.posts (
  id                uuid primary key default gen_random_uuid(),
  author_id         uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  kind              text not null default 'post' check (kind in ('post', 'reel')),
  caption           text not null default '' check (char_length(caption) <= 2200),
  comments_enabled  boolean not null default true,
  status            text not null default 'published' check (status in ('published', 'removed')),
  like_count        integer not null default 0 check (like_count >= 0),
  comment_count     integer not null default 0 check (comment_count >= 0),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index posts_author_created_idx on public.posts (author_id, created_at desc, id desc);
create index posts_published_created_idx on public.posts (created_at desc, id desc) where status = 'published';
create index posts_reels_created_idx on public.posts (created_at desc, id desc) where status = 'published' and kind = 'reel';

create trigger posts_set_updated_at
  before update of caption, comments_enabled on public.posts
  for each row execute function private.set_updated_at();

create trigger posts_rate_limit
  before insert on public.posts
  for each row execute function private.enforce_rate_limit('author_id', '1 hour', '30');

create table public.post_media (
  id            uuid primary key default gen_random_uuid(),
  post_id       uuid not null references public.posts (id) on delete cascade,
  owner_id      uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  position      smallint not null check (position between 0 and 9),
  storage_path  text not null unique check (char_length(storage_path) <= 300),
  media_type    text not null check (media_type in ('image', 'video')),
  mime_type     text not null check (mime_type in (
                  'image/jpeg', 'image/png', 'image/webp', 'image/gif',
                  'video/mp4', 'video/quicktime', 'video/webm')),
  width         integer check (width is null or width between 1 and 10000),
  height        integer check (height is null or height between 1 and 10000),
  duration_ms   integer check (duration_ms is null or duration_ms between 0 and 180000),
  alt_text      text check (alt_text is null or char_length(alt_text) <= 500),
  created_at    timestamptz not null default now(),
  unique (post_id, position),
  check ((media_type = 'image') = (mime_type like 'image/%'))
);

create index post_media_post_idx on public.post_media (post_id, position);

-- ---------------------------------------------------------------------
-- Visibility predicate for a post
-- ---------------------------------------------------------------------

create or replace function public.can_view_post(p_post uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.posts p
    where p.id = p_post
      and (p.status = 'published' or p.author_id = auth.uid() or public.is_staff())
      and private.viewer_can_view_profile(auth.uid(), p.author_id)
  );
$$;

-- ---------------------------------------------------------------------
-- Media integrity: the object must exist in the caller's folder of the
-- private `media` bucket, and its stored MIME type must match.
-- ---------------------------------------------------------------------

create or replace function private.post_media_before_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_meta jsonb;
begin
  new.created_at := now();
  if split_part(new.storage_path, '/', 1) <> new.owner_id::text then
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

create trigger post_media_before_insert
  before insert on public.post_media
  for each row execute function private.post_media_before_insert();

create or replace function private.post_media_after_delete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.enqueue_media_deletion('media', old.storage_path, 'post_deleted');
  return old;
end;
$$;

create trigger post_media_after_delete
  after delete on public.post_media
  for each row execute function private.post_media_after_delete();

-- Every post must have 1â€“10 media at commit time; reels exactly one video.
create or replace function private.check_post_media()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_kind text;
  v_total integer;
  v_videos integer;
begin
  select p.kind into v_kind from public.posts p where p.id = new.id;
  if not found then
    return null; -- deleted within the same transaction
  end if;
  select count(*), count(*) filter (where m.media_type = 'video')
    into v_total, v_videos
  from public.post_media m where m.post_id = new.id;
  if v_total = 0 then
    raise exception 'post_requires_media' using errcode = 'P0001';
  end if;
  if v_total > 10 then
    raise exception 'too_many_media' using errcode = 'P0001';
  end if;
  if v_kind = 'reel' and (v_total <> 1 or v_videos <> 1) then
    raise exception 'reel_requires_single_video' using errcode = 'P0001';
  end if;
  return null;
end;
$$;

create constraint trigger posts_require_media
  after insert on public.posts
  deferrable initially deferred
  for each row execute function private.check_post_media();

-- ---------------------------------------------------------------------
-- Hashtags + mentions
-- ---------------------------------------------------------------------

create table public.hashtags (
  id          uuid primary key default gen_random_uuid(),
  tag         text not null unique check (tag ~ '^[a-z0-9_]{1,50}$'),
  post_count  integer not null default 0 check (post_count >= 0),
  created_at  timestamptz not null default now()
);

create index hashtags_tag_prefix_idx on public.hashtags (tag text_pattern_ops);

create table public.post_hashtags (
  post_id     uuid not null references public.posts (id) on delete cascade,
  hashtag_id  uuid not null references public.hashtags (id) on delete cascade,
  primary key (post_id, hashtag_id)
);

create index post_hashtags_hashtag_idx on public.post_hashtags (hashtag_id);

create or replace function private.post_hashtags_count()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    update public.hashtags set post_count = post_count + 1 where id = new.hashtag_id;
    return new;
  else
    update public.hashtags set post_count = greatest(post_count - 1, 0) where id = old.hashtag_id;
    return old;
  end if;
end;
$$;

create trigger post_hashtags_count
  after insert or delete on public.post_hashtags
  for each row execute function private.post_hashtags_count();

create or replace function private.extract_hashtags(p_text text)
returns text[]
language sql
immutable
as $$
  select coalesce(array_agg(distinct t), '{}')
  from (
    select lower(m[1]) as t
    from regexp_matches(coalesce(p_text, ''), '#([A-Za-z0-9_]{1,50})', 'g') as m
    limit 30
  ) s;
$$;

create or replace function private.notify_mentions(p_text text, p_actor uuid, p_post uuid, p_post_author uuid, p_comment uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid;
begin
  for v_user in
    select p.id
    from public.profiles p
    where p.username in (
      select distinct lower(m[1])
      from regexp_matches(coalesce(p_text, ''), '@([A-Za-z0-9._]{3,30})', 'g') as m
    )
    limit 20
  loop
    -- Only notify people who can actually open the post.
    if private.viewer_can_view_profile(v_user, p_post_author) then
      perform private.notify(v_user, p_actor, 'mention', p_post, p_comment);
    end if;
  end loop;
end;
$$;

create or replace function private.posts_after_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tags text[];
begin
  if tg_op = 'INSERT' or new.caption is distinct from old.caption then
    v_tags := private.extract_hashtags(new.caption);
    delete from public.post_hashtags ph
      where ph.post_id = new.id
        and ph.hashtag_id not in (select h.id from public.hashtags h where h.tag = any (v_tags));
    insert into public.hashtags (tag) select unnest(v_tags) on conflict (tag) do nothing;
    insert into public.post_hashtags (post_id, hashtag_id)
      select new.id, h.id from public.hashtags h where h.tag = any (v_tags)
      on conflict do nothing;
    perform private.notify_mentions(new.caption, new.author_id, new.id, new.author_id, null);
  end if;

  if tg_op = 'INSERT' then
    if new.status = 'published' then
      update public.profiles set posts_count = posts_count + 1 where id = new.author_id;
    end if;
  elsif old.status is distinct from new.status then
    if new.status = 'published' then
      update public.profiles set posts_count = posts_count + 1 where id = new.author_id;
    else
      update public.profiles set posts_count = greatest(posts_count - 1, 0) where id = new.author_id;
    end if;
  end if;
  return new;
end;
$$;

create trigger posts_after_write
  after insert or update of caption, status on public.posts
  for each row execute function private.posts_after_write();

create or replace function private.posts_after_delete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.status = 'published' then
    update public.profiles set posts_count = greatest(posts_count - 1, 0) where id = old.author_id;
  end if;
  delete from public.notifications where post_id = old.id;
  return old;
end;
$$;

create trigger posts_after_delete
  after delete on public.posts
  for each row execute function private.posts_after_delete();

-- ---------------------------------------------------------------------
-- Likes
-- ---------------------------------------------------------------------

create table public.likes (
  user_id     uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  post_id     uuid not null references public.posts (id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (user_id, post_id)
);

create index likes_post_idx on public.likes (post_id, created_at desc);
create index likes_user_created_idx on public.likes (user_id, created_at desc);

create trigger likes_rate_limit
  before insert on public.likes
  for each row execute function private.enforce_rate_limit('user_id', '1 minute', '60');

create or replace function private.likes_after_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_author uuid;
begin
  if tg_op = 'INSERT' then
    update public.posts set like_count = like_count + 1 where id = new.post_id returning author_id into v_author;
    perform private.notify(v_author, new.user_id, 'like', new.post_id);
    return new;
  else
    update public.posts set like_count = greatest(like_count - 1, 0) where id = old.post_id;
    delete from public.notifications
      where type = 'like' and post_id = old.post_id and actor_id = old.user_id and read_at is null;
    return old;
  end if;
end;
$$;

create trigger likes_after_change
  after insert or delete on public.likes
  for each row execute function private.likes_after_change();

-- ---------------------------------------------------------------------
-- Comments (one level of replies)
-- ---------------------------------------------------------------------

create table public.comments (
  id          uuid primary key default gen_random_uuid(),
  post_id     uuid not null references public.posts (id) on delete cascade,
  author_id   uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  parent_id   uuid references public.comments (id) on delete cascade,
  body        text not null check (char_length(body) between 1 and 1000),
  created_at  timestamptz not null default now()
);

create index comments_post_thread_idx on public.comments (post_id, created_at, id) where parent_id is null;
create index comments_parent_idx on public.comments (parent_id, created_at, id) where parent_id is not null;
create index comments_author_created_idx on public.comments (author_id, created_at desc);

create trigger comments_rate_limit
  before insert on public.comments
  for each row execute function private.enforce_rate_limit('author_id', '1 minute', '20');

create or replace function private.comments_before_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_enabled boolean;
  v_parent record;
begin
  new.created_at := now();
  new.body := btrim(new.body);
  select p.comments_enabled into v_enabled from public.posts p where p.id = new.post_id;
  if not found then
    raise exception 'post_not_found' using errcode = 'P0001';
  end if;
  if not v_enabled then
    raise exception 'comments_disabled' using errcode = 'P0001';
  end if;
  if new.parent_id is not null then
    select c.post_id, c.parent_id into v_parent from public.comments c where c.id = new.parent_id;
    if not found or v_parent.post_id <> new.post_id then
      raise exception 'invalid_parent_comment' using errcode = 'P0001';
    end if;
    -- Flatten: replies to replies attach to the top-level thread.
    if v_parent.parent_id is not null then
      new.parent_id := v_parent.parent_id;
    end if;
  end if;
  return new;
end;
$$;

create trigger comments_before_insert
  before insert on public.comments
  for each row execute function private.comments_before_insert();

create or replace function private.comments_after_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_post_author uuid;
  v_parent_author uuid;
begin
  if tg_op = 'INSERT' then
    update public.posts set comment_count = comment_count + 1 where id = new.post_id returning author_id into v_post_author;
    if new.parent_id is not null then
      select c.author_id into v_parent_author from public.comments c where c.id = new.parent_id;
      perform private.notify(v_parent_author, new.author_id, 'reply', new.post_id, new.id, null, left(new.body, 140));
    end if;
    if v_parent_author is distinct from v_post_author then
      perform private.notify(v_post_author, new.author_id, 'comment', new.post_id, new.id, null, left(new.body, 140));
    end if;
    perform private.notify_mentions(new.body, new.author_id, new.post_id, v_post_author, new.id);
    return new;
  else
    update public.posts set comment_count = greatest(comment_count - 1, 0) where id = old.post_id;
    delete from public.notifications where comment_id = old.id;
    return old;
  end if;
end;
$$;

create trigger comments_after_change
  after insert or delete on public.comments
  for each row execute function private.comments_after_change();

-- ---------------------------------------------------------------------
-- Saved posts
-- ---------------------------------------------------------------------

create table public.saved_posts (
  user_id     uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  post_id     uuid not null references public.posts (id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (user_id, post_id)
);

create index saved_posts_user_idx on public.saved_posts (user_id, created_at desc);

-- ---------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------

alter table public.posts          enable row level security;
alter table public.post_media     enable row level security;
alter table public.likes          enable row level security;
alter table public.comments       enable row level security;
alter table public.saved_posts    enable row level security;
alter table public.hashtags       enable row level security;
alter table public.post_hashtags  enable row level security;

revoke all on public.posts, public.post_media, public.likes, public.comments, public.saved_posts,
              public.hashtags, public.post_hashtags from anon, authenticated;

-- posts
grant select on public.posts to anon, authenticated;
grant insert (id, author_id, kind, caption, comments_enabled),
      update (caption, comments_enabled),
      delete on public.posts to authenticated;

create policy posts_select on public.posts
  for select to anon, authenticated
  using (
    (status = 'published' or author_id = auth.uid() or public.is_staff())
    and public.can_view_profile(author_id)
  );
create policy posts_insert_own on public.posts
  for insert to authenticated
  with check (author_id = auth.uid() and public.current_user_active());
create policy posts_update_own on public.posts
  for update to authenticated
  using (author_id = auth.uid() and status = 'published')
  with check (author_id = auth.uid() and public.current_user_active());
create policy posts_delete_own on public.posts
  for delete to authenticated
  using (author_id = auth.uid());

-- post_media
grant select on public.post_media to anon, authenticated;
grant insert (post_id, owner_id, position, storage_path, media_type, mime_type, width, height, duration_ms, alt_text)
  on public.post_media to authenticated;

create policy post_media_select on public.post_media
  for select to anon, authenticated
  using (public.can_view_post(post_id));
create policy post_media_insert_own on public.post_media
  for insert to authenticated
  with check (
    owner_id = auth.uid()
    and exists (select 1 from public.posts p where p.id = post_id and p.author_id = auth.uid())
  );

-- likes
grant select on public.likes to anon, authenticated;
grant insert (user_id, post_id), delete on public.likes to authenticated;

create policy likes_select on public.likes
  for select to anon, authenticated
  using (public.can_view_post(post_id) and not public.is_blocked_with(user_id));
create policy likes_insert_own on public.likes
  for insert to authenticated
  with check (user_id = auth.uid() and public.current_user_active() and public.can_view_post(post_id));
create policy likes_delete_own on public.likes
  for delete to authenticated
  using (user_id = auth.uid());

-- comments
grant select on public.comments to anon, authenticated;
grant insert (post_id, author_id, parent_id, body), delete on public.comments to authenticated;

create policy comments_select on public.comments
  for select to anon, authenticated
  using (public.can_view_post(post_id) and not public.is_blocked_with(author_id));
create policy comments_insert_own on public.comments
  for insert to authenticated
  with check (
    author_id = auth.uid()
    and public.current_user_active()
    and public.can_view_post(post_id)
    and not exists (
      select 1 from public.posts p where p.id = post_id and public.is_blocked_with(p.author_id)
    )
  );
-- Authors may delete their comments; post owners may delete comments on their posts.
create policy comments_delete on public.comments
  for delete to authenticated
  using (
    author_id = auth.uid()
    or exists (select 1 from public.posts p where p.id = post_id and p.author_id = auth.uid())
  );

-- saved_posts: strictly private to the saver. anon gets SELECT only so the
-- post_cards view can evaluate saved_by_me; no anon policy exists → 0 rows.
grant select on public.saved_posts to anon;
grant select, insert (user_id, post_id), delete on public.saved_posts to authenticated;
create policy saved_select_own on public.saved_posts
  for select to authenticated using (user_id = auth.uid());
create policy saved_insert_own on public.saved_posts
  for insert to authenticated with check (user_id = auth.uid() and public.can_view_post(post_id));
create policy saved_delete_own on public.saved_posts
  for delete to authenticated using (user_id = auth.uid());

-- hashtags: public directory; links follow post visibility. Writes via triggers only.
grant select on public.hashtags, public.post_hashtags to anon, authenticated;
create policy hashtags_select on public.hashtags
  for select to anon, authenticated using (true);
create policy post_hashtags_select on public.post_hashtags
  for select to anon, authenticated using (public.can_view_post(post_id));

-- ---------------------------------------------------------------------
-- Read model: post cards (security invoker â†’ RLS of the caller applies)
-- ---------------------------------------------------------------------

create view public.post_cards
with (security_invoker = true)
as
select
  p.id,
  p.author_id,
  p.kind,
  p.caption,
  p.comments_enabled,
  p.status,
  p.like_count,
  p.comment_count,
  p.created_at,
  p.updated_at,
  a.is_private as author_is_private,
  jsonb_build_object(
    'id', a.id,
    'username', a.username,
    'display_name', a.display_name,
    'avatar_path', a.avatar_path,
    'is_private', a.is_private
  ) as author,
  coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', m.id,
      'position', m.position,
      'storage_path', m.storage_path,
      'media_type', m.media_type,
      'mime_type', m.mime_type,
      'width', m.width,
      'height', m.height,
      'duration_ms', m.duration_ms,
      'alt_text', m.alt_text
    ) order by m.position)
    from public.post_media m
    where m.post_id = p.id
  ), '[]'::jsonb) as media,
  exists (select 1 from public.likes l where l.post_id = p.id and l.user_id = auth.uid()) as liked_by_me,
  exists (select 1 from public.saved_posts s where s.post_id = p.id and s.user_id = auth.uid()) as saved_by_me
from public.posts p
join public.profiles a on a.id = p.author_id;

grant select on public.post_cards to anon, authenticated;

-- ---------------------------------------------------------------------
-- Feeds â€” all keyset-paginated on (created_at desc, id desc)
-- ---------------------------------------------------------------------

-- Following feed: own posts + accepted follows, minus muted accounts.
create or replace function public.feed_home(
  p_before_created timestamptz default null,
  p_before_id uuid default null,
  p_limit integer default 12
)
returns setof public.post_cards
language sql
stable
security invoker
set search_path = ''
as $$
  select c.*
  from public.post_cards c
  where c.status = 'published'
    and (
      c.author_id = auth.uid()
      or c.author_id in (
        select f.following_id from public.follows f
        where f.follower_id = auth.uid() and f.status = 'accepted'
      )
    )
    and not exists (select 1 from public.mutes m where m.muter_id = auth.uid() and m.muted_id = c.author_id)
    and (p_before_created is null or (c.created_at, c.id) < (p_before_created, p_before_id))
  order by c.created_at desc, c.id desc
  limit least(greatest(coalesce(p_limit, 12), 1), 50);
$$;

-- Explore: public accounts only.
--   latest   â†’ newest first
--   trending â†’ last 7 days ordered by engagement score (likes + 2 Ã— comments),
--              then recency. Deterministic and documented; not ML.
create or replace function public.feed_explore(
  p_mode text default 'trending',
  p_before_score integer default null,
  p_before_created timestamptz default null,
  p_before_id uuid default null,
  p_limit integer default 24
)
returns setof public.post_cards
language sql
stable
security invoker
set search_path = ''
as $$
  select c.*
  from public.post_cards c
  where c.status = 'published'
    and not c.author_is_private
    and c.author_id <> coalesce(auth.uid(), '00000000-0000-0000-0000-000000000000'::uuid)
    and not exists (select 1 from public.mutes m where m.muter_id = auth.uid() and m.muted_id = c.author_id)
    and (p_mode <> 'trending' or c.created_at > now() - interval '7 days')
    and (
      p_before_created is null
      or (p_mode = 'trending'
          and (c.like_count + 2 * c.comment_count, c.created_at, c.id) < (p_before_score, p_before_created, p_before_id))
      or (p_mode <> 'trending' and (c.created_at, c.id) < (p_before_created, p_before_id))
    )
  order by
    case when p_mode = 'trending' then c.like_count + 2 * c.comment_count end desc nulls last,
    c.created_at desc,
    c.id desc
  limit least(greatest(coalesce(p_limit, 24), 1), 50);
$$;

-- Reels: short videos from public accounts, followed accounts and yourself.
create or replace function public.feed_reels(
  p_before_created timestamptz default null,
  p_before_id uuid default null,
  p_limit integer default 6
)
returns setof public.post_cards
language sql
stable
security invoker
set search_path = ''
as $$
  select c.*
  from public.post_cards c
  where c.status = 'published'
    and c.kind = 'reel'
    and not exists (select 1 from public.mutes m where m.muter_id = auth.uid() and m.muted_id = c.author_id)
    and (p_before_created is null or (c.created_at, c.id) < (p_before_created, p_before_id))
  order by c.created_at desc, c.id desc
  limit least(greatest(coalesce(p_limit, 6), 1), 20);
$$;

create or replace function public.feed_profile(
  p_author uuid,
  p_kind text default null,
  p_before_created timestamptz default null,
  p_before_id uuid default null,
  p_limit integer default 18
)
returns setof public.post_cards
language sql
stable
security invoker
set search_path = ''
as $$
  select c.*
  from public.post_cards c
  where c.author_id = p_author
    and c.status = 'published'
    and (p_kind is null or c.kind = p_kind)
    and (p_before_created is null or (c.created_at, c.id) < (p_before_created, p_before_id))
  order by c.created_at desc, c.id desc
  limit least(greatest(coalesce(p_limit, 18), 1), 50);
$$;

create or replace function public.feed_hashtag(
  p_tag text,
  p_before_created timestamptz default null,
  p_before_id uuid default null,
  p_limit integer default 24
)
returns setof public.post_cards
language sql
stable
security invoker
set search_path = ''
as $$
  select c.*
  from public.post_cards c
  join public.post_hashtags ph on ph.post_id = c.id
  join public.hashtags h on h.id = ph.hashtag_id
  where h.tag = lower(trim(both '#' from p_tag))
    and c.status = 'published'
    and (p_before_created is null or (c.created_at, c.id) < (p_before_created, p_before_id))
  order by c.created_at desc, c.id desc
  limit least(greatest(coalesce(p_limit, 24), 1), 50);
$$;

-- Saved collection (ordered by post date for stable keyset pagination).
create or replace function public.feed_saved(
  p_before_created timestamptz default null,
  p_before_id uuid default null,
  p_limit integer default 24
)
returns setof public.post_cards
language sql
stable
security invoker
set search_path = ''
as $$
  select c.*
  from public.post_cards c
  join public.saved_posts s on s.post_id = c.id and s.user_id = auth.uid()
  where c.status = 'published'
    and (p_before_created is null or (c.created_at, c.id) < (p_before_created, p_before_id))
  order by c.created_at desc, c.id desc
  limit least(greatest(coalesce(p_limit, 24), 1), 50);
$$;

create or replace function public.get_post(p_id uuid)
returns setof public.post_cards
language sql
stable
security invoker
set search_path = ''
as $$
  select c.* from public.post_cards c where c.id = p_id;
$$;

-- Comment threads with author info and reply counts; ascending keyset.
create or replace function public.list_comments(
  p_post uuid,
  p_parent uuid default null,
  p_after_created timestamptz default null,
  p_after_id uuid default null,
  p_limit integer default 20
)
returns table (
  id uuid,
  post_id uuid,
  parent_id uuid,
  body text,
  created_at timestamptz,
  author_id uuid,
  author_username text,
  author_display_name text,
  author_avatar_path text,
  reply_count integer
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    c.id, c.post_id, c.parent_id, c.body, c.created_at,
    a.id, a.username, a.display_name, a.avatar_path,
    (select count(*)::integer from public.comments r where r.parent_id = c.id)
  from public.comments c
  join public.profiles a on a.id = c.author_id
  where c.post_id = p_post
    and c.parent_id is not distinct from p_parent
    and (p_after_created is null or (c.created_at, c.id) > (p_after_created, p_after_id))
  order by c.created_at asc, c.id asc
  limit least(greatest(coalesce(p_limit, 20), 1), 100);
$$;

create or replace function public.search_hashtags(p_query text, p_limit integer default 20)
returns table (id uuid, tag text, post_count integer)
language sql
stable
security invoker
set search_path = ''
as $$
  select h.id, h.tag, h.post_count
  from public.hashtags h
  where char_length(lower(trim(both '#' from coalesce(p_query, '')))) >= 1
    and h.tag like replace(lower(trim(both '#' from p_query)), '_', '\_') || '%'
    and h.post_count > 0
  order by h.post_count desc, h.tag
  limit least(greatest(coalesce(p_limit, 20), 1), 50);
$$;

-- ---------------------------------------------------------------------
-- Atomic post creation (post + media rows in one transaction).
-- Runs as the caller, so every RLS policy and trigger above still applies.
-- p_media: [{ storage_path, media_type, mime_type, width?, height?, duration_ms?, alt_text? }]
-- ---------------------------------------------------------------------

create or replace function public.create_post(
  p_caption text,
  p_media jsonb,
  p_kind text default 'post',
  p_comments_enabled boolean default true
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_post uuid;
  v_item jsonb;
  v_pos integer := 0;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated' using errcode = 'P0001';
  end if;
  if jsonb_typeof(p_media) <> 'array' or jsonb_array_length(p_media) not between 1 and 10 then
    raise exception 'post_requires_media' using errcode = 'P0001';
  end if;

  insert into public.posts (author_id, kind, caption, comments_enabled)
  values (auth.uid(), coalesce(p_kind, 'post'), coalesce(p_caption, ''), coalesce(p_comments_enabled, true))
  returning id into v_post;

  for v_item in select value from jsonb_array_elements(p_media)
  loop
    insert into public.post_media (post_id, owner_id, position, storage_path, media_type, mime_type, width, height, duration_ms, alt_text)
    values (
      v_post,
      auth.uid(),
      v_pos,
      v_item ->> 'storage_path',
      v_item ->> 'media_type',
      v_item ->> 'mime_type',
      nullif(v_item ->> 'width', '')::integer,
      nullif(v_item ->> 'height', '')::integer,
      nullif(v_item ->> 'duration_ms', '')::integer,
      nullif(v_item ->> 'alt_text', '')
    );
    v_pos := v_pos + 1;
  end loop;

  return v_post;
end;
$$;

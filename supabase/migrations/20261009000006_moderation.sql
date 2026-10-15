-- =====================================================================
-- VYBORA · 0006 · Safety & administration
-- Reports from users; moderation actions only through audited
-- security-definer functions that verify staff roles server-side.
--   moderator: triage reports, remove/restore posts, remove comments
--   admin:     everything above + suspend/restore accounts, manage roles
-- =====================================================================

create table public.reports (
  id           uuid primary key default gen_random_uuid(),
  reporter_id  uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  target_type  text not null check (target_type in ('post', 'comment', 'profile', 'story')),
  target_id    uuid not null,
  reason       text not null check (reason in (
                 'spam', 'harassment', 'hate', 'violence', 'nudity', 'self_harm',
                 'misinformation', 'intellectual_property', 'other')),
  details      text check (details is null or char_length(details) <= 1000),
  status       text not null default 'open' check (status in ('open', 'reviewing', 'actioned', 'dismissed')),
  handled_by   uuid references public.profiles (id) on delete set null,
  handled_at   timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index reports_status_created_idx on public.reports (status, created_at desc);
create index reports_target_idx on public.reports (target_type, target_id);
create index reports_reporter_created_idx on public.reports (reporter_id, created_at desc);
-- A user can have only one open report per target.
create unique index reports_open_uniq on public.reports (reporter_id, target_type, target_id)
  where status in ('open', 'reviewing');

create trigger reports_set_updated_at
  before update on public.reports
  for each row execute function private.set_updated_at();

create trigger reports_rate_limit
  before insert on public.reports
  for each row execute function private.enforce_rate_limit('reporter_id', '1 hour', '20');

create or replace function private.reports_before_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_exists boolean;
begin
  new.status := 'open';
  new.handled_by := null;
  new.handled_at := null;
  new.created_at := now();
  v_exists := case new.target_type
    when 'post' then exists (select 1 from public.posts where id = new.target_id)
    when 'comment' then exists (select 1 from public.comments where id = new.target_id)
    when 'profile' then exists (select 1 from public.profiles where id = new.target_id)
    when 'story' then exists (select 1 from public.stories where id = new.target_id)
    else false
  end;
  if not v_exists then
    raise exception 'report_target_not_found' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger reports_before_insert
  before insert on public.reports
  for each row execute function private.reports_before_insert();

create table public.moderation_actions (
  id            uuid primary key default gen_random_uuid(),
  moderator_id  uuid references public.profiles (id) on delete set null,
  action        text not null check (action in (
                  'remove_post', 'restore_post', 'remove_comment', 'remove_story',
                  'suspend_user', 'restore_user', 'grant_role', 'revoke_role',
                  'report_status')),
  target_type   text not null check (target_type in ('post', 'comment', 'profile', 'story', 'report')),
  target_id     uuid not null,
  report_id     uuid references public.reports (id) on delete set null,
  reason        text check (reason is null or char_length(reason) <= 1000),
  metadata      jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now()
);

create index moderation_actions_created_idx on public.moderation_actions (created_at desc);
create index moderation_actions_target_idx on public.moderation_actions (target_type, target_id);

alter table public.reports            enable row level security;
alter table public.moderation_actions enable row level security;

revoke all on public.reports, public.moderation_actions from anon, authenticated;

grant select, insert (reporter_id, target_type, target_id, reason, details) on public.reports to authenticated;
create policy reports_insert_own on public.reports
  for insert to authenticated
  with check (reporter_id = auth.uid() and public.current_user_active());
create policy reports_select on public.reports
  for select to authenticated
  using (reporter_id = auth.uid() or public.is_staff());

grant select on public.moderation_actions to authenticated;
create policy moderation_actions_select_staff on public.moderation_actions
  for select to authenticated using (public.is_staff());

-- ---------------------------------------------------------------------
-- Internal guard + logger
-- ---------------------------------------------------------------------

create or replace function private.require_staff(p_admin_only boolean default false)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if p_admin_only and not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  elsif not public.is_staff() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
end;
$$;

create or replace function private.log_moderation(
  p_action text, p_target_type text, p_target_id uuid, p_report uuid, p_reason text, p_metadata jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.moderation_actions (moderator_id, action, target_type, target_id, report_id, reason, metadata)
  values (auth.uid(), p_action, p_target_type, p_target_id, p_report, p_reason, coalesce(p_metadata, '{}'::jsonb));
  perform private.audit('moderation.' || p_action, p_target_type, p_target_id,
    jsonb_build_object('report_id', p_report, 'reason', p_reason) || coalesce(p_metadata, '{}'::jsonb));
  if p_report is not null then
    update public.reports
      set status = 'actioned', handled_by = auth.uid(), handled_at = now()
      where id = p_report and status in ('open', 'reviewing');
  end if;
end;
$$;

-- ---------------------------------------------------------------------
-- Moderation RPCs
-- ---------------------------------------------------------------------

create or replace function public.mod_set_report_status(p_report uuid, p_status text, p_note text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_staff();
  if p_status not in ('open', 'reviewing', 'actioned', 'dismissed') then
    raise exception 'invalid_status' using errcode = 'P0001';
  end if;
  update public.reports
    set status = p_status,
        handled_by = case when p_status in ('actioned', 'dismissed') then auth.uid() else handled_by end,
        handled_at = case when p_status in ('actioned', 'dismissed') then now() else handled_at end
    where id = p_report;
  if not found then
    raise exception 'report_not_found' using errcode = 'P0001';
  end if;
  insert into public.moderation_actions (moderator_id, action, target_type, target_id, report_id, reason, metadata)
  values (auth.uid(), 'report_status', 'report', p_report, p_report, p_note, jsonb_build_object('status', p_status));
  perform private.audit('moderation.report_status', 'report', p_report, jsonb_build_object('status', p_status, 'note', p_note));
end;
$$;

create or replace function public.mod_remove_post(p_post uuid, p_reason text, p_report uuid default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_author uuid;
begin
  perform private.require_staff();
  update public.posts set status = 'removed' where id = p_post and status = 'published'
    returning author_id into v_author;
  if v_author is null then
    raise exception 'post_not_found_or_already_removed' using errcode = 'P0001';
  end if;
  perform private.log_moderation('remove_post', 'post', p_post, p_report, p_reason);
  perform private.notify(v_author, null, 'moderation', p_post, null, null,
    'Your post was removed for violating community guidelines.');
end;
$$;

create or replace function public.mod_restore_post(p_post uuid, p_reason text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_staff();
  update public.posts set status = 'published' where id = p_post and status = 'removed';
  if not found then
    raise exception 'post_not_found_or_not_removed' using errcode = 'P0001';
  end if;
  perform private.log_moderation('restore_post', 'post', p_post, null, p_reason);
end;
$$;

create or replace function public.mod_remove_comment(p_comment uuid, p_reason text, p_report uuid default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.comments;
begin
  perform private.require_staff();
  delete from public.comments where id = p_comment returning * into v_row;
  if v_row.id is null then
    raise exception 'comment_not_found' using errcode = 'P0001';
  end if;
  perform private.log_moderation('remove_comment', 'comment', p_comment, p_report, p_reason,
    jsonb_build_object('post_id', v_row.post_id, 'author_id', v_row.author_id, 'body_snapshot', left(v_row.body, 1000)));
end;
$$;

create or replace function public.mod_remove_story(p_story uuid, p_reason text, p_report uuid default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_author uuid;
begin
  perform private.require_staff();
  delete from public.stories where id = p_story returning author_id into v_author;
  if v_author is null then
    raise exception 'story_not_found' using errcode = 'P0001';
  end if;
  perform private.log_moderation('remove_story', 'story', p_story, p_report, p_reason,
    jsonb_build_object('author_id', v_author));
end;
$$;

create or replace function public.admin_set_user_status(p_user uuid, p_status text, p_reason text, p_report uuid default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_staff(true);
  if p_status not in ('active', 'suspended') then
    raise exception 'invalid_status' using errcode = 'P0001';
  end if;
  if p_user = auth.uid() then
    raise exception 'cannot_moderate_self' using errcode = 'P0001';
  end if;
  update public.profiles set status = p_status where id = p_user;
  if not found then
    raise exception 'profile_not_found' using errcode = 'P0001';
  end if;
  perform private.log_moderation(
    case when p_status = 'suspended' then 'suspend_user' else 'restore_user' end,
    'profile', p_user, p_report, p_reason);
end;
$$;

create or replace function public.admin_set_role(p_user uuid, p_role text, p_grant boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_staff(true);
  if p_role not in ('admin', 'moderator') then
    raise exception 'invalid_role' using errcode = 'P0001';
  end if;
  if not p_grant and p_user = auth.uid() and p_role = 'admin' then
    raise exception 'cannot_revoke_own_admin' using errcode = 'P0001';
  end if;
  if p_grant then
    insert into public.user_roles (user_id, role, granted_by) values (p_user, p_role, auth.uid())
    on conflict do nothing;
  else
    delete from public.user_roles where user_id = p_user and role = p_role;
  end if;
  perform private.log_moderation(case when p_grant then 'grant_role' else 'revoke_role' end,
    'profile', p_user, null, null, jsonb_build_object('role', p_role));
end;
$$;

-- Platform overview built from real rows.
create or replace function public.admin_overview()
returns table (
  total_users integer,
  new_users_7d integer,
  suspended_users integer,
  total_posts integer,
  posts_24h integer,
  removed_posts integer,
  active_stories integer,
  open_reports integer,
  messages_24h integer
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.require_staff();
  return query select
    (select count(*)::integer from public.profiles),
    (select count(*)::integer from public.profiles where created_at > now() - interval '7 days'),
    (select count(*)::integer from public.profiles where status = 'suspended'),
    (select count(*)::integer from public.posts where status = 'published'),
    (select count(*)::integer from public.posts where created_at > now() - interval '24 hours'),
    (select count(*)::integer from public.posts where status = 'removed'),
    (select count(*)::integer from public.stories where expires_at > now()),
    (select count(*)::integer from public.reports where status in ('open', 'reviewing')),
    -- volume only; message content is never exposed to staff
    (select count(*)::integer from public.messages where created_at > now() - interval '24 hours');
end;
$$;

-- Staff user lookup (includes suspended accounts and roles).
create or replace function public.admin_search_users(p_query text default '', p_limit integer default 25)
returns table (
  id uuid,
  username text,
  display_name text,
  avatar_path text,
  status text,
  is_private boolean,
  posts_count integer,
  followers_count integer,
  created_at timestamptz,
  roles text[],
  open_reports integer
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.require_staff();
  return query
    select p.id, p.username, p.display_name, p.avatar_path, p.status, p.is_private,
           p.posts_count, p.followers_count, p.created_at,
           coalesce((select array_agg(r.role order by r.role) from public.user_roles r where r.user_id = p.id), '{}'),
           (select count(*)::integer from public.reports rp
              where rp.target_type = 'profile' and rp.target_id = p.id and rp.status in ('open', 'reviewing'))
    from public.profiles p
    where coalesce(p_query, '') = ''
       or p.username like lower(p_query) || '%'
       or lower(p.display_name) like lower(p_query) || '%'
       or p.id = public.try_uuid(p_query)
    order by p.created_at desc
    limit least(greatest(coalesce(p_limit, 25), 1), 100);
end;
$$;

-- Repair counters from source rows (admin only, audited).
create or replace function public.admin_recount_counters()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_staff(true);
  update public.profiles p set
    posts_count = (select count(*) from public.posts x where x.author_id = p.id and x.status = 'published'),
    followers_count = (select count(*) from public.follows f where f.following_id = p.id and f.status = 'accepted'),
    following_count = (select count(*) from public.follows f where f.follower_id = p.id and f.status = 'accepted');
  update public.posts x set
    like_count = (select count(*) from public.likes l where l.post_id = x.id),
    comment_count = (select count(*) from public.comments c where c.post_id = x.id);
  update public.hashtags h set
    post_count = (select count(*) from public.post_hashtags ph where ph.hashtag_id = h.id);
  perform private.audit('admin.recount_counters', 'system', null);
end;
$$;

revoke execute on function
  public.mod_set_report_status(uuid, text, text),
  public.mod_remove_post(uuid, text, uuid),
  public.mod_restore_post(uuid, text),
  public.mod_remove_comment(uuid, text, uuid),
  public.mod_remove_story(uuid, text, uuid),
  public.admin_set_user_status(uuid, text, text, uuid),
  public.admin_set_role(uuid, text, boolean),
  public.admin_overview(),
  public.admin_search_users(text, integer),
  public.admin_recount_counters()
from public, anon;

grant execute on function
  public.mod_set_report_status(uuid, text, text),
  public.mod_remove_post(uuid, text, uuid),
  public.mod_restore_post(uuid, text),
  public.mod_remove_comment(uuid, text, uuid),
  public.mod_remove_story(uuid, text, uuid),
  public.admin_set_user_status(uuid, text, text, uuid),
  public.admin_set_role(uuid, text, boolean),
  public.admin_overview(),
  public.admin_search_users(text, integer),
  public.admin_recount_counters()
to authenticated;

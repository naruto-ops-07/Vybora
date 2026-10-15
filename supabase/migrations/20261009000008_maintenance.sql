-- =====================================================================
-- VYBORA · 0008 · Maintenance RPCs for the trusted `cleanup-media` job.
-- The `private` schema is not exposed through the API, so these narrow
-- service-role-only functions are the interface to it.
-- =====================================================================

-- Atomically claim (and remove) up to p_limit queued deletions.
create or replace function public.claim_media_deletions(p_limit integer default 100)
returns table (bucket_id text, object_path text)
language sql
security definer
set search_path = ''
as $$
  with claimed as (
    select q.id from private.media_deletion_queue q
    order by q.id
    limit least(greatest(coalesce(p_limit, 100), 1), 1000)
    for update skip locked
  )
  delete from private.media_deletion_queue q
  using claimed
  where q.id = claimed.id
  returning q.bucket_id, q.object_path;
$$;

-- Objects older than p_older_than that no row references (abandoned uploads).
-- The age threshold protects uploads that are still being published.
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
    )
  order by o.created_at
  limit least(greatest(coalesce(p_limit, 500), 1), 5000);
$$;

revoke execute on function public.claim_media_deletions(integer) from public, anon, authenticated;
revoke execute on function public.find_orphan_media(interval, integer) from public, anon, authenticated;
grant execute on function public.claim_media_deletions(integer) to service_role;
grant execute on function public.find_orphan_media(interval, integer) to service_role;

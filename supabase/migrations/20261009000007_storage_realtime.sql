-- =====================================================================
-- VYBORA · 0007 · Storage buckets, Storage RLS, Realtime publication
--
-- Buckets
--   avatars  public   profile pictures (public by product design)
--   media    private  post / reel / story media → signed URLs only
--   dm       private  message attachments → members only, signed URLs
--
-- Path conventions (enforced below and by table triggers)
--   avatars/{user_id}/{file}
--   media/{user_id}/{file}
--   dm/{conversation_id}/{user_id}/{file}
-- =====================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('avatars', 'avatars', true, 5242880, array['image/jpeg', 'image/png', 'image/webp']),
  ('media', 'media', false, 104857600,
     array['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'video/mp4', 'video/quicktime', 'video/webm']),
  ('dm', 'dm', false, 10485760, array['image/jpeg', 'image/png', 'image/webp', 'image/gif'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Can the caller read this object in the `media` bucket?
create or replace function public.can_read_media(p_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    (auth.uid() is not null and split_part(p_name, '/', 1) = auth.uid()::text)
    or exists (
      select 1
      from public.post_media m
      join public.posts p on p.id = m.post_id
      where m.storage_path = p_name
        and (p.status = 'published' or public.is_staff())
        and private.viewer_can_view_profile(auth.uid(), p.author_id)
    )
    or exists (
      select 1 from public.stories s
      where s.storage_path = p_name
        and s.expires_at > now()
        and private.viewer_can_view_profile(auth.uid(), s.author_id)
    );
$$;

-- avatars ------------------------------------------------------------
create policy "avatars: public read"
  on storage.objects for select to anon, authenticated
  using (bucket_id = 'avatars');

create policy "avatars: owner insert"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "avatars: owner update"
  on storage.objects for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "avatars: owner delete"
  on storage.objects for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

-- media --------------------------------------------------------------
create policy "media: visibility-aware read"
  on storage.objects for select to anon, authenticated
  using (bucket_id = 'media' and public.can_read_media(name));

create policy "media: owner upload"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'media'
    and (storage.foldername(name))[1] = auth.uid()::text
    and public.current_user_active()
  );

create policy "media: owner delete"
  on storage.objects for delete to authenticated
  using (bucket_id = 'media' and (storage.foldername(name))[1] = auth.uid()::text);

-- dm -----------------------------------------------------------------
create policy "dm: members read"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'dm'
    and public.is_conversation_member(public.try_uuid((storage.foldername(name))[1]))
  );

create policy "dm: member upload to own folder"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'dm'
    and public.is_conversation_member(public.try_uuid((storage.foldername(name))[1]))
    and (storage.foldername(name))[2] = auth.uid()::text
    and public.current_user_active()
  );

create policy "dm: sender delete"
  on storage.objects for delete to authenticated
  using (bucket_id = 'dm' and (storage.foldername(name))[2] = auth.uid()::text);

-- Realtime: messages and notifications stream to subscribers, filtered by RLS.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.messages;
    alter publication supabase_realtime add table public.notifications;
  end if;
end;
$$;

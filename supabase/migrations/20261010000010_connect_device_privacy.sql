-- VYBORA Connect: device metadata privacy (additive hardening of 0009).
--
-- Other users need a device's public identity key (to add it to encrypted
-- groups and to compute safety numbers) and whether it is revoked — nothing
-- more. Device labels ("Pixel 9"), platform and last-seen times are private
-- to the owner: last_seen_at would otherwise leak activity even when "show
-- when I'm online" is off.

revoke select on public.devices from authenticated;
grant select (id, user_id, identity_key, created_at, revoked_at) on public.devices to authenticated;

-- The owner's full device list (Privacy & security → Linked devices).
create or replace function public.my_devices()
returns table (
  id            uuid,
  user_id       uuid,
  identity_key  text,
  platform      text,
  label         text,
  created_at    timestamptz,
  last_seen_at  timestamptz,
  revoked_at    timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select d.id, d.user_id, d.identity_key, d.platform, d.label, d.created_at, d.last_seen_at, d.revoked_at
  from public.devices d
  where d.user_id = auth.uid()
  order by d.created_at;
$$;

revoke execute on function public.my_devices() from public, anon;
grant execute on function public.my_devices() to authenticated;

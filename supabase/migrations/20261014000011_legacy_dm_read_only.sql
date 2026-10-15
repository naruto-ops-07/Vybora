-- VYBORA is now a messaging-only product where every new conversation is
-- end-to-end encrypted. Pre-encryption ("legacy") direct messages stay
-- readable to their members and senders can still unsend them, but no new
-- plaintext conversations or messages can be created. Additive and reversible:
--   grant insert (conversation_id, sender_id, body, attachment_path, attachment_mime, client_id)
--     on public.messages to authenticated;
--   grant execute on function public.start_direct_conversation(uuid) to authenticated;

revoke insert on public.messages from authenticated;
revoke execute on function public.start_direct_conversation(uuid) from authenticated;

comment on table public.messages is
  'Legacy plaintext direct messages (read-only since 2026-10-14). New messaging uses mls_envelopes.';

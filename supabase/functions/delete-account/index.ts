// Permanently delete the calling user's account.
// 1) Verify the caller from their JWT and the typed username confirmation.
// 2) Remove their objects from every bucket (avatars, media, their DM uploads).
// 3) Delete the auth user — profile and all owned rows cascade in Postgres.
import { adminClient, callerId, cors, json, listAll } from '../_shared/admin.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  const userId = await callerId(req);
  if (!userId) return json({ error: 'not_authenticated' }, 401);

  const body = (await req.json().catch(() => ({}))) as { confirm_username?: string };
  const admin = adminClient();

  const { data: profile, error: profileError } = await admin
    .from('profiles')
    .select('username')
    .eq('id', userId)
    .single();
  if (profileError || !profile) return json({ error: 'profile_not_found' }, 404);
  if ((body.confirm_username ?? '').trim().toLowerCase() !== profile.username) {
    return json({ error: 'confirmation_mismatch' }, 400);
  }

  try {
    // Owned uploads
    for (const bucket of ['avatars', 'media']) {
      const paths = await listAll(admin, bucket, userId);
      for (let i = 0; i < paths.length; i += 100) {
        const { error } = await admin.storage.from(bucket).remove(paths.slice(i, i + 100));
        if (error) throw error;
      }
    }
    // DM attachments this user sent (path: {conversation}/{user}/file)
    const { data: sent } = await admin
      .from('messages')
      .select('attachment_path')
      .eq('sender_id', userId)
      .not('attachment_path', 'is', null);
    const dmPaths = (sent ?? []).map((m) => m.attachment_path as string);
    for (let i = 0; i < dmPaths.length; i += 100) {
      await admin.storage.from('dm').remove(dmPaths.slice(i, i + 100));
    }

    await admin.from('audit_logs').insert({
      actor_id: null,
      action: 'account.deleted',
      entity: 'profile',
      entity_id: userId,
      metadata: {},
    });

    const { error: deleteError } = await admin.auth.admin.deleteUser(userId);
    if (deleteError) throw deleteError;
    return json({ ok: true });
  } catch (error) {
    console.error('delete-account failed', error);
    return json({ error: 'deletion_failed' }, 500);
  }
});

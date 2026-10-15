// Push delivery for new notifications via the Expo Push API.
// Trigger: a Supabase Database Webhook on INSERT into public.notifications
// (configure in the dashboard with header x-webhook-secret = WEBHOOK_SECRET).
// Tokens that Expo reports as DeviceNotRegistered are deleted.
import { adminClient, env, json, safeEqual } from '../_shared/admin.ts';

type NotificationRow = {
  id: string;
  recipient_id: string;
  actor_id: string | null;
  type: string;
  post_id: string | null;
  conversation_id: string | null;
  body: string | null;
};

const COPY: Record<string, string> = {
  follow: 'started following you',
  follow_request: 'requested to follow you',
  follow_accept: 'accepted your follow request',
  like: 'liked your post',
  comment: 'commented on your post',
  reply: 'replied to your comment',
  mention: 'mentioned you',
};

Deno.serve(async (req) => {
  if (!safeEqual(req.headers.get('x-webhook-secret') ?? '', env('WEBHOOK_SECRET')))
    return json({ error: 'forbidden' }, 403);
  const payload = (await req.json()) as { type: string; record?: NotificationRow };
  const n = payload.record;
  if (payload.type !== 'INSERT' || !n) return json({ skipped: true });

  const admin = adminClient();
  const { data: settings } = await admin
    .from('user_settings')
    .select('push_enabled')
    .eq('user_id', n.recipient_id)
    .single();
  if (settings && !settings.push_enabled) return json({ skipped: 'disabled' });

  const { data: tokens } = await admin
    .from('device_tokens')
    .select('token')
    .eq('user_id', n.recipient_id);
  if (!tokens?.length) return json({ skipped: 'no_tokens' });

  // Messages: respect global + per-chat notification settings and mute, and
  // pick the sound/channel from the recipient's per-chat tone. Message content
  // is end-to-end encrypted — the server never has it, and the payload only
  // ever says "New message" (optionally with the sender's name).
  let sound: string | null = 'default';
  let channelId = 'default';
  let showSender = true;
  if (n.type === 'message' && n.conversation_id) {
    const { data: gate, error } = await admin
      .rpc('should_push_message', {
        p_recipient: n.recipient_id,
        p_conversation: n.conversation_id,
      })
      .maybeSingle();
    if (error) return json({ error: 'gate_failed' }, 500);
    const g = gate as { allowed: boolean; tone: string } | null;
    if (g && !g.allowed) return json({ skipped: 'muted' });
    const tone = g?.tone ?? 'default';
    sound = tone === 'none' ? null : tone === 'default' ? 'default' : `${tone}.wav`;
    channelId =
      tone === 'none' ? 'messages-silent' : tone === 'default' ? 'messages' : `messages-${tone}`;
    const { data: prefs } = await admin
      .from('user_settings')
      .select('message_previews')
      .eq('user_id', n.recipient_id)
      .maybeSingle();
    showSender = prefs?.message_previews ?? true;
  }

  let actor = 'Someone';
  if (n.actor_id && showSender) {
    const { data } = await admin.from('profiles').select('username').eq('id', n.actor_id).single();
    if (data) actor = data.username;
  }
  // Message bodies are NEVER included in push payloads.
  const body =
    n.type === 'moderation'
      ? (n.body ?? 'Update about your account')
      : n.type === 'message'
        ? showSender
          ? `New message from ${actor}`
          : 'New message'
        : `${actor} ${COPY[n.type] ?? 'has an update for you'}`;
  const url = n.conversation_id
    ? `vybora://messages/${n.conversation_id}`
    : n.post_id
      ? `vybora://p/${n.post_id}`
      : 'vybora://notifications';

  const messages = tokens.map((t) => ({
    to: t.token,
    title: 'VYBORA',
    body,
    sound,
    channelId,
    priority: n.type === 'message' ? 'high' : 'default',
    data: { url },
  }));
  const res = await fetch('https://exp.host/--/api/v2/push/send', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...(Deno.env.get('EXPO_ACCESS_TOKEN')
        ? { Authorization: `Bearer ${Deno.env.get('EXPO_ACCESS_TOKEN')}` }
        : {}),
    },
    body: JSON.stringify(messages),
  });
  const result = (await res.json()) as {
    data?: { status: string; details?: { error?: string } }[];
  };

  const invalid = (result.data ?? []).flatMap((r, i) =>
    r.status === 'error' && r.details?.error === 'DeviceNotRegistered' ? [tokens[i]!.token] : [],
  );
  if (invalid.length) await admin.from('device_tokens').delete().in('token', invalid);

  return json({ sent: messages.length, removedTokens: invalid.length });
});

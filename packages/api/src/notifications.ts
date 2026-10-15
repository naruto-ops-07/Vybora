import type { NotificationView } from '@vybora/types';
import { unwrap, type VyboraClient } from './client';

export const NOTIFICATION_PAGE = 30;

export async function fetchNotifications(
  client: VyboraClient,
  before?: { created_at: string; id: string } | null,
): Promise<NotificationView[]> {
  let query = client
    .from('notifications')
    .select(
      'id, type, actor_id, post_id, comment_id, conversation_id, body, read_at, created_at, actor:profiles!notifications_actor_id_fkey(username, display_name, avatar_path)',
    )
    .neq('type', 'message')
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(NOTIFICATION_PAGE);
  if (before) {
    query = query.or(
      `created_at.lt.${before.created_at},and(created_at.eq.${before.created_at},id.lt.${before.id})`,
    );
  }
  return unwrap(await query) as unknown as NotificationView[];
}

export async function fetchUnreadCounts(client: VyboraClient) {
  const rows = unwrap(await client.rpc('unread_counts'));
  return { notifications: rows[0]?.notifications ?? 0, conversations: rows[0]?.conversations ?? 0 };
}

export async function markAllNotificationsRead(client: VyboraClient) {
  unwrap(await client.rpc('mark_all_notifications_read'));
}

/** Live badge updates; RLS limits events to the recipient. */
export function subscribeToNotifications(
  client: VyboraClient,
  userId: string,
  onChange: () => void,
): () => void {
  const channel = client
    .channel(`notifications:${userId}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'notifications', filter: `recipient_id=eq.${userId}` },
      () => onChange(),
    )
    .subscribe();
  return () => {
    void client.removeChannel(channel);
  };
}

export async function registerDeviceToken(
  client: VyboraClient,
  token: string,
  platform: 'ios' | 'android' | 'web',
) {
  const { error } = await client.from('device_tokens').insert({ token, platform });
  if (error && error.code === '23505') {
    unwrap(
      await client
        .from('device_tokens')
        .update({ last_seen_at: new Date().toISOString() })
        .eq('token', token),
    );
    return;
  }
  if (error) throw error;
}

export async function unregisterDeviceToken(client: VyboraClient, token: string) {
  unwrap(await client.from('device_tokens').delete().eq('token', token));
}

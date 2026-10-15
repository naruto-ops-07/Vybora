import type { RealtimeChannel } from '@supabase/supabase-js';
import type { ConversationSummary, Message } from '@vybora/types';
import { messageSchema } from '@vybora/validation';
import { unwrap, type VyboraClient } from './client';

export const MESSAGE_PAGE = 30;

export async function startConversation(
  client: VyboraClient,
  otherUserId: string,
): Promise<string> {
  return unwrap(await client.rpc('start_direct_conversation', { p_other: otherUserId })) as string;
}

export async function fetchConversations(
  client: VyboraClient,
  before?: string | null,
): Promise<ConversationSummary[]> {
  return unwrap(
    await client.rpc('my_conversations', { p_before: before ?? undefined, p_limit: 30 }),
  ).map((r) => ({
    conversation_id: r.conversation_id!,
    last_message_at: r.last_message_at!,
    other_id: r.other_id,
    other_username: r.other_username,
    other_display_name: r.other_display_name,
    other_avatar_path: r.other_avatar_path,
    last_message_body: r.last_message_body,
    last_message_sender: r.last_message_sender,
    last_message_has_attachment: !!r.last_message_has_attachment,
    unread_count: r.unread_count ?? 0,
  }));
}

export async function fetchConversationPeer(
  client: VyboraClient,
  conversationId: string,
  myId: string,
) {
  const rows = unwrap(
    await client
      .from('conversation_members')
      .select('user_id, last_read_at, profile:profiles(id, username, display_name, avatar_path)')
      .eq('conversation_id', conversationId),
  );
  const me = rows.find((r) => r.user_id === myId);
  const other = rows.find((r) => r.user_id !== myId);
  return { me, other: other?.profile ?? null, otherLastReadAt: other?.last_read_at ?? null };
}

/** Newest-first page; the UI reverses for display. */
export async function fetchMessages(
  client: VyboraClient,
  conversationId: string,
  before?: { created_at: string; id: string } | null,
): Promise<Message[]> {
  let query = client
    .from('messages')
    .select(
      'id, conversation_id, sender_id, body, attachment_path, attachment_mime, client_id, created_at',
    )
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(MESSAGE_PAGE);
  if (before) {
    query = query.or(
      `created_at.lt.${before.created_at},and(created_at.eq.${before.created_at},id.lt.${before.id})`,
    );
  }
  return unwrap(await query) as Message[];
}

/**
 * Persist a message. `clientId` makes retries idempotent: a duplicate means
 * the earlier attempt already succeeded, so we return the stored row.
 */
export async function sendMessage(
  client: VyboraClient,
  userId: string,
  input: {
    conversationId: string;
    body?: string;
    attachmentPath?: string;
    attachmentMime?: string;
    clientId: string;
  },
): Promise<Message> {
  const body = input.body ? messageSchema.parse(input.body) : null;
  const { data, error } = await client
    .from('messages')
    .insert({
      conversation_id: input.conversationId,
      sender_id: userId,
      body: body || null,
      attachment_path: input.attachmentPath ?? null,
      attachment_mime: input.attachmentMime ?? null,
      client_id: input.clientId,
    })
    .select(
      'id, conversation_id, sender_id, body, attachment_path, attachment_mime, client_id, created_at',
    )
    .single();
  if (error?.code === '23505') {
    return unwrap(
      await client
        .from('messages')
        .select(
          'id, conversation_id, sender_id, body, attachment_path, attachment_mime, client_id, created_at',
        )
        .eq('sender_id', userId)
        .eq('client_id', input.clientId)
        .single(),
    ) as Message;
  }
  if (error) throw error;
  return data as Message;
}

export async function deleteMessage(client: VyboraClient, id: string) {
  unwrap(await client.from('messages').delete().eq('id', id));
}

export async function markConversationRead(client: VyboraClient, conversationId: string) {
  unwrap(await client.rpc('mark_conversation_read', { p_conversation: conversationId }));
}

/**
 * Realtime subscription for one conversation. RLS on `messages` ensures only
 * members receive events. Returns an unsubscribe function (always call it).
 */
export function subscribeToConversation(
  client: VyboraClient,
  conversationId: string,
  handlers: {
    onInsert: (m: Message) => void;
    onDelete?: (id: string) => void;
    onStatus?: (status: 'SUBSCRIBED' | 'TIMED_OUT' | 'CLOSED' | 'CHANNEL_ERROR') => void;
  },
): () => void {
  const channel: RealtimeChannel = client
    .channel(`conversation:${conversationId}`)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'messages',
        filter: `conversation_id=eq.${conversationId}`,
      },
      (payload) => handlers.onInsert(payload.new as Message),
    )
    .on(
      'postgres_changes',
      {
        event: 'DELETE',
        schema: 'public',
        table: 'messages',
        filter: `conversation_id=eq.${conversationId}`,
      },
      (payload) => {
        const id = (payload.old as { id?: string }).id;
        if (id) handlers.onDelete?.(id);
      },
    )
    .subscribe((status) => handlers.onStatus?.(status));
  return () => {
    void client.removeChannel(channel);
  };
}

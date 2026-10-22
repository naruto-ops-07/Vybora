import type { RealtimeChannel } from '@supabase/supabase-js';
import {
  toConnectError,
  type ConnectTransport,
  type DeviceRecord,
  type EnvelopeRecord,
  type PostedEnvelope,
  type WelcomeRecord,
} from '@vybora/e2ee';
import type { Json } from '@vybora/types';
import { unwrap, type VyboraClient } from './client';
import { acquireChannel, type ChannelSpec } from './realtime';

// ---------------------------------------------------------------------
// Transport: the engine's only path to the server (ciphertext + public keys)
// ---------------------------------------------------------------------

// Other users' devices expose only these columns (migration 0010).
const PUBLIC_DEVICE_COLUMNS = 'id, user_id, identity_key, created_at, revoked_at';

type DeviceRow = {
  id: string;
  user_id: string;
  identity_key: string;
  created_at: string;
  revoked_at: string | null;
};

const toDevice = (r: DeviceRow): DeviceRecord => ({
  id: r.id,
  userId: r.user_id,
  identityKey: r.identity_key,
  createdAt: r.created_at,
  revoked: r.revoked_at !== null,
});

type Resp = { data: unknown; error: unknown };

async function settle<R extends Resp>(fn: () => PromiseLike<R>): Promise<R['data']> {
  let result: R;
  try {
    result = await fn();
  } catch (error) {
    throw toConnectError(error);
  }
  if (result.error) throw toConnectError(result.error, (result as { status?: number }).status);
  return result.data;
}

/** Await a PostgREST call, mapping failures to ConnectError codes the engine understands. */
async function run<R extends Resp>(fn: () => PromiseLike<R>): Promise<NonNullable<R['data']>> {
  return (await settle(fn)) as NonNullable<R['data']>;
}

/** Like run(), for `.maybeSingle()` where no row is a valid result. */
async function runMaybe<R extends Resp>(
  fn: () => PromiseLike<R>,
): Promise<NonNullable<R['data']> | null> {
  return ((await settle(fn)) ?? null) as NonNullable<R['data']> | null;
}

export function createSupabaseConnectTransport(
  client: VyboraClient,
  userId: string,
): ConnectTransport {
  return {
    async registerDevice(input) {
      const row = await run(() =>
        client
          .from('devices')
          .insert({
            user_id: userId,
            platform: input.platform,
            label: input.label,
            identity_key: input.identityKey,
          })
          .select('id')
          .single(),
      );
      return row.id;
    },
    async revokeDevice(deviceId) {
      await run(() =>
        client.from('devices').update({ revoked_at: new Date().toISOString() }).eq('id', deviceId),
      );
    },
    async touchDevice(deviceId) {
      await run(() =>
        client
          .from('devices')
          .update({ last_seen_at: new Date().toISOString() })
          .eq('id', deviceId),
      );
    },
    async countUnclaimedKeyPackages(deviceId) {
      const { count, error } = await client
        .from('key_packages')
        .select('id', { count: 'exact', head: true })
        .eq('device_id', deviceId)
        .is('claimed_at', null);
      if (error) throw toConnectError(error);
      return count ?? 0;
    },
    async publishKeyPackages(deviceId, packages) {
      if (!packages.length) return;
      await run(() =>
        client
          .from('key_packages')
          .insert(
            packages.map((key_package) => ({ device_id: deviceId, user_id: userId, key_package })),
          ),
      );
    },
    async getDevice(deviceId) {
      const row = await runMaybe(() =>
        client.from('devices').select(PUBLIC_DEVICE_COLUMNS).eq('id', deviceId).maybeSingle(),
      );
      return row ? toDevice(row as DeviceRow) : null;
    },
    async listDevices(userIds) {
      if (!userIds.length) return [];
      const rows = await run(() =>
        client
          .from('devices')
          .select(PUBLIC_DEVICE_COLUMNS)
          .in('user_id', userIds)
          .order('created_at'),
      );
      return (rows as DeviceRow[]).map(toDevice);
    },
    async listOwnDevices() {
      const rows = await run(() => client.rpc('my_devices'));
      return rows.map((r) => ({
        id: r.id!,
        userId: r.user_id!,
        identityKey: r.identity_key!,
        createdAt: r.created_at!,
        revoked: r.revoked_at !== null,
        platform: r.platform ?? '',
        label: r.label ?? '',
        lastSeenAt: r.last_seen_at ?? r.created_at!,
      }));
    },
    async claimKeyPackages(deviceIds) {
      const rows = await run(() => client.rpc('claim_key_packages', { p_device_ids: deviceIds }));
      return rows.map((r) => ({
        deviceId: r.device_id!,
        userId: r.user_id!,
        keyPackage: r.key_package,
      }));
    },
    async getConversation(conversationId) {
      const conv = await runMaybe(() =>
        client
          .from('conversations')
          .select('id, kind, mls_epoch, settings_policy')
          .eq('id', conversationId)
          .maybeSingle(),
      );
      if (!conv) throw toConnectError({ message: 'not_a_member' });
      const members = await run(() =>
        client
          .from('conversation_members')
          .select('user_id, role')
          .eq('conversation_id', conversationId),
      );
      return {
        id: conv.id,
        kind: conv.kind as 'direct' | 'group',
        epoch: Number(conv.mls_epoch),
        memberIds: members.map((m) => m.user_id),
        adminIds: members.filter((m) => m.role === 'admin').map((m) => m.user_id),
        settingsPolicy: conv.settings_policy === 'admins' ? 'admins' : 'everyone',
      };
    },
    async listWelcomes(conversationId, deviceId): Promise<WelcomeRecord[]> {
      const rows = await run(() =>
        client
          .from('mls_welcomes')
          .select('id, epoch, commit_seq, welcome')
          .eq('conversation_id', conversationId)
          .eq('device_id', deviceId),
      );
      return rows.map((r) => ({
        id: r.id,
        conversationId,
        epoch: Number(r.epoch),
        commitSeq: Number(r.commit_seq),
        welcome: r.welcome,
      }));
    },
    async deleteWelcome(id) {
      await run(() => client.from('mls_welcomes').delete().eq('id', id));
    },
    async fetchEnvelopes(conversationId, afterSeq, limit): Promise<EnvelopeRecord[]> {
      const rows = await run(() =>
        client
          .from('mls_envelopes')
          .select(
            'seq, sender_id, sender_device_id, epoch, kind, ciphertext, client_id, created_at, expires_at',
          )
          .eq('conversation_id', conversationId)
          .gt('seq', afterSeq)
          .order('seq')
          .limit(limit),
      );
      return rows.map((r) => ({
        seq: Number(r.seq),
        conversationId,
        senderId: r.sender_id,
        senderDeviceId: r.sender_device_id,
        epoch: Number(r.epoch),
        kind: r.kind as 'commit' | 'application',
        ciphertext: r.ciphertext,
        clientId: r.client_id,
        createdAt: r.created_at,
        expiresAt: r.expires_at,
      }));
    },
    async postCommit(input) {
      const seq = await run(() =>
        client.rpc('post_commit', {
          p_conversation: input.conversationId,
          p_device: input.deviceId,
          p_epoch: input.epoch,
          p_commit: input.commit,
          p_client_id: input.clientId,
          p_welcomes: input.welcomes.map((w) => ({
            device_id: w.deviceId,
            welcome: w.welcome,
          })) as unknown as Json,
        }),
      );
      return Number(seq);
    },
    async postApplication(input): Promise<PostedEnvelope> {
      const row = await run(() =>
        client
          .from('mls_envelopes')
          .insert({
            conversation_id: input.conversationId,
            sender_id: userId,
            sender_device_id: input.deviceId,
            epoch: input.epoch,
            kind: 'application',
            ciphertext: input.ciphertext,
            client_id: input.clientId,
            attachment_paths: input.attachmentPaths,
          })
          .select('seq, created_at, expires_at')
          .single(),
      );
      return { seq: Number(row.seq), createdAt: row.created_at, expiresAt: row.expires_at };
    },
    async findOwnEnvelope(deviceId, clientId) {
      const row = await runMaybe(() =>
        client
          .from('mls_envelopes')
          .select('seq, created_at, expires_at')
          .eq('sender_device_id', deviceId)
          .eq('client_id', clientId)
          .maybeSingle(),
      );
      return row
        ? { seq: Number(row.seq), createdAt: row.created_at, expiresAt: row.expires_at }
        : null;
    },
    async uploadAttachment(path, ciphertext) {
      const { error } = await client.storage
        .from('connect')
        .upload(path, ciphertext, { contentType: 'application/octet-stream', upsert: false });
      if (error) throw toConnectError(error);
    },
    async downloadAttachment(path) {
      const { data, error } = await client.storage.from('connect').download(path);
      if (error || !data) throw toConnectError(error ?? { message: 'download_failed' });
      return new Uint8Array(await data.arrayBuffer());
    },
  };
}

// ---------------------------------------------------------------------
// Inbox and conversation metadata (no message content — that is local)
// ---------------------------------------------------------------------

export interface ConnectMember {
  id: string;
  username: string;
  display_name: string;
  avatar_path: string | null;
  role: 'admin' | 'member';
  delivered_seq: number;
  read_seq: number;
}

export interface ChatTheme {
  preset?: ThemePreset;
  wallpaper?: Wallpaper | null;
  accent?: string | null;
}

export const THEME_PRESETS = [
  'violet',
  'midnight',
  'aurora',
  'ember',
  'ocean',
  'forest',
  'rose',
  'mono',
] as const;
export const WALLPAPERS = ['none', 'nebula', 'waves', 'grid', 'bloom', 'dunes', 'stars'] as const;
export const MESSAGE_TONES = [
  'default',
  'soft_chime',
  'pop',
  'bell',
  'electronic',
  'none',
] as const;
export type ThemePreset = (typeof THEME_PRESETS)[number];
export type Wallpaper = (typeof WALLPAPERS)[number];
export type MessageTone = (typeof MESSAGE_TONES)[number];

export interface SecureConversation {
  id: string;
  kind: 'direct' | 'group';
  title: string | null;
  avatarPath: string | null;
  lastMessageAt: string;
  lastSeq: number;
  epoch: number;
  theme: ChatTheme;
  themeVersion: number;
  themeUpdatedBy: string | null;
  disappearingSeconds: number | null;
  settingsPolicy: 'everyone' | 'admins';
  myRole: 'admin' | 'member';
  unreadCount: number;
  pinned: boolean;
  archived: boolean;
  mutedUntil: string | null;
  notificationsEnabled: boolean;
  tone: MessageTone;
  lastReadSeq: number;
  clearedBeforeSeq: number;
  localTheme: ChatTheme | null;
  useLocalTheme: boolean;
  members: ConnectMember[];
}

export async function fetchSecureInbox(client: VyboraClient): Promise<SecureConversation[]> {
  const rows = unwrap(await client.rpc('my_secure_conversations'));
  return rows.map((r) => ({
    id: r.conversation_id!,
    kind: r.kind as 'direct' | 'group',
    title: r.title,
    avatarPath: r.avatar_path,
    lastMessageAt: r.last_message_at!,
    lastSeq: Number(r.last_seq ?? 0),
    epoch: Number(r.mls_epoch ?? 0),
    theme: (r.theme ?? {}) as ChatTheme,
    themeVersion: r.theme_version ?? 0,
    themeUpdatedBy: r.theme_updated_by,
    disappearingSeconds: r.disappearing_seconds,
    settingsPolicy: (r.settings_policy ?? 'everyone') as 'everyone' | 'admins',
    myRole: (r.my_role ?? 'member') as 'admin' | 'member',
    unreadCount: r.unread_count ?? 0,
    pinned: !!r.pinned,
    archived: !!r.archived,
    mutedUntil: r.muted_until,
    notificationsEnabled: r.notifications_enabled ?? true,
    tone: (r.tone ?? 'default') as MessageTone,
    lastReadSeq: Number(r.last_read_seq ?? 0),
    clearedBeforeSeq: Number(r.cleared_before_seq ?? 0),
    localTheme: (r.local_theme as ChatTheme | null) ?? null,
    useLocalTheme: !!r.use_local_theme,
    members: ((r.members ?? []) as unknown as ConnectMember[]).map((m) => ({
      ...m,
      delivered_seq: Number(m.delivered_seq),
      read_seq: Number(m.read_seq),
    })),
  }));
}

export async function createSecureConversation(
  client: VyboraClient,
  kind: 'direct' | 'group',
  memberIds: string[],
  title?: string,
): Promise<string> {
  return unwrap(
    await client.rpc('create_secure_conversation', {
      p_kind: kind,
      p_member_ids: memberIds,
      p_title: title,
    }),
  ) as string;
}

/** The other person in a direct chat, or null for groups. */
export function peerOf(
  conv: Pick<SecureConversation, 'kind' | 'members'>,
  myId: string,
): ConnectMember | null {
  return conv.kind === 'direct' ? (conv.members.find((m) => m.id !== myId) ?? null) : null;
}

/**
 * Latest activity of each direct-chat peer (peer id → ISO time), for ordering
 * friends and for watching presence only of people I share a chat with.
 */
export function directChatActivity(
  convs: readonly Pick<SecureConversation, 'kind' | 'members' | 'lastMessageAt'>[] | undefined,
  myId: string,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const c of convs ?? []) {
    const peer = peerOf(c, myId);
    if (peer && (out[peer.id] ?? '') < c.lastMessageAt) out[peer.id] = c.lastMessageAt;
  }
  return out;
}

export function isMuted(conv: Pick<SecureConversation, 'mutedUntil'>, now = Date.now()): boolean {
  if (!conv.mutedUntil) return false;
  if (conv.mutedUntil === 'infinity') return true; // Postgres "muted until I turn it back on"
  return Date.parse(conv.mutedUntil) > now;
}

/** "1h" | "8h" | "1w" | "always" → a muted_until timestamp. */
export function muteUntil(duration: '1h' | '8h' | '1w' | 'always', now = Date.now()): string {
  if (duration === 'always') return 'infinity';
  const ms = { '1h': 3_600_000, '8h': 8 * 3_600_000, '1w': 7 * 86_400_000 }[duration];
  return new Date(now + ms).toISOString();
}

export type PreferencePatch = Partial<{
  notifications_enabled: boolean;
  muted_until: string | null;
  tone: MessageTone;
  pinned: boolean;
  archived: boolean;
  last_read_seq: number;
  cleared_before_seq: number;
  local_theme: ChatTheme | null;
  use_local_theme: boolean;
}>;

/** Private, per-user conversation preferences (synced across this user's devices). */
export async function updateConversationPreferences(
  client: VyboraClient,
  userId: string,
  conversationId: string,
  patch: PreferencePatch,
) {
  unwrap(
    await client
      .from('conversation_preferences')
      .upsert(
        { user_id: userId, conversation_id: conversationId, ...(patch as Record<string, unknown>) },
        { onConflict: 'user_id,conversation_id' },
      ),
  );
}

export async function acknowledgeConversation(
  client: VyboraClient,
  conversationId: string,
  deliveredSeq: number,
  readSeq: number | null,
) {
  unwrap(
    await client.rpc('ack_conversation', {
      p_conversation: conversationId,
      p_delivered_seq: deliveredSeq,
      p_read_seq: readSeq ?? 0,
    }),
  );
}

/** Shared theme for ALL participants. Pass the version you saw; a stale version fails with theme_conflict. */
export async function setSharedTheme(
  client: VyboraClient,
  conversationId: string,
  theme: ChatTheme,
  expectedVersion: number,
): Promise<number> {
  return unwrap(
    await client.rpc('set_conversation_theme', {
      p_conversation: conversationId,
      p_theme: theme as unknown as Json,
      p_expected_version: expectedVersion,
    }),
  ) as number;
}

export async function setDisappearing(
  client: VyboraClient,
  conversationId: string,
  seconds: number | null,
) {
  unwrap(
    await client.rpc('set_disappearing_messages', {
      p_conversation: conversationId,
      p_seconds: seconds as number,
    }),
  );
}

export const groupAdmin = {
  updateInfo: async (
    client: VyboraClient,
    conversationId: string,
    title: string,
    avatarPath: string | null,
  ) =>
    unwrap(
      await client.rpc('update_group_info', {
        p_conversation: conversationId,
        p_title: title,
        p_avatar_path: avatarPath as string,
      }),
    ),
  addMembers: async (client: VyboraClient, conversationId: string, userIds: string[]) =>
    unwrap(
      await client.rpc('add_group_members', {
        p_conversation: conversationId,
        p_user_ids: userIds,
      }),
    ),
  removeMember: async (client: VyboraClient, conversationId: string, userId: string) =>
    unwrap(
      await client.rpc('remove_group_member', { p_conversation: conversationId, p_user: userId }),
    ),
  setRole: async (
    client: VyboraClient,
    conversationId: string,
    userId: string,
    role: 'admin' | 'member',
  ) =>
    unwrap(
      await client.rpc('set_member_role', {
        p_conversation: conversationId,
        p_user: userId,
        p_role: role,
      }),
    ),
  setPolicy: async (client: VyboraClient, conversationId: string, policy: 'everyone' | 'admins') =>
    unwrap(
      await client.rpc('set_group_policy', { p_conversation: conversationId, p_policy: policy }),
    ),
};

// ---------------------------------------------------------------------
// Private nicknames, consent-based phone numbers, privacy settings
// ---------------------------------------------------------------------

export async function fetchNicknames(client: VyboraClient): Promise<Record<string, string>> {
  const rows = unwrap(await client.from('contact_nicknames').select('contact_id, nickname'));
  return Object.fromEntries(rows.map((r) => [r.contact_id, r.nickname]));
}

export async function setNickname(
  client: VyboraClient,
  ownerId: string,
  contactId: string,
  nickname: string | null,
) {
  if (!nickname?.trim()) {
    unwrap(
      await client
        .from('contact_nicknames')
        .delete()
        .eq('owner_id', ownerId)
        .eq('contact_id', contactId),
    );
    return;
  }
  unwrap(
    await client
      .from('contact_nicknames')
      .upsert(
        { owner_id: ownerId, contact_id: contactId, nickname: nickname.trim() },
        { onConflict: 'owner_id,contact_id' },
      ),
  );
}

export async function fetchContactPhone(
  client: VyboraClient,
  userId: string,
): Promise<string | null> {
  return (
    (unwrap(await client.rpc('get_contact_phone', { p_user: userId })) as string | null) ?? null
  );
}

export async function fetchMyContactMethod(client: VyboraClient, userId: string) {
  return unwrap(
    await client
      .from('contact_methods')
      .select('phone_e164, visibility')
      .eq('user_id', userId)
      .maybeSingle(),
  );
}

export async function saveMyContactMethod(
  client: VyboraClient,
  userId: string,
  phone: string | null,
  visibility: 'nobody' | 'contacts' | 'everyone',
) {
  unwrap(
    await client
      .from('contact_methods')
      .upsert({ user_id: userId, phone_e164: phone, visibility }, { onConflict: 'user_id' }),
  );
}

export interface ConnectPrivacy {
  notifications_enabled: boolean;
  read_receipts: boolean;
  typing_indicators: boolean;
  show_online: boolean;
  message_previews: boolean;
  message_privacy: 'everyone' | 'following' | 'friends';
}

export async function fetchConnectPrivacy(
  client: VyboraClient,
  userId: string,
): Promise<ConnectPrivacy> {
  return unwrap(
    await client
      .from('user_settings')
      .select(
        'notifications_enabled, read_receipts, typing_indicators, show_online, message_previews, message_privacy',
      )
      .eq('user_id', userId)
      .single(),
  ) as ConnectPrivacy;
}

export async function updateConnectPrivacy(
  client: VyboraClient,
  userId: string,
  patch: Partial<ConnectPrivacy>,
) {
  unwrap(await client.from('user_settings').update(patch).eq('user_id', userId));
}

/** Record that I'm active (server time; throttled to once a minute server-side). */
export async function touchActivity(client: VyboraClient): Promise<void> {
  const { error } = await client.rpc('touch_activity');
  if (error) throw error;
}

/** Last-seen times the server allows me to see (reciprocal, shared chats only). */
export async function fetchLastSeen(
  client: VyboraClient,
  userIds: string[],
): Promise<Record<string, string>> {
  if (!userIds.length) return {};
  const rows = unwrap(await client.rpc('last_seen', { p_user_ids: userIds.slice(0, 100) }));
  return Object.fromEntries(rows.map((r) => [r.user_id!, r.last_active_at!]));
}

// ---------------------------------------------------------------------
// Realtime: durable change signals + ephemeral typing/presence
// ---------------------------------------------------------------------

/**
 * Signals only — payloads are ciphertext/metadata and the engine re-fetches
 * from PostgreSQL (the source of truth). Returns an unsubscribe function.
 */
export function subscribeToSecureConversation(
  client: VyboraClient,
  conversationId: string,
  handlers: { onEnvelope: () => void; onMetadata: () => void; onStatus?: (s: string) => void },
): () => void {
  const channel: RealtimeChannel = client
    .channel(`connect-db:${conversationId}`)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'mls_envelopes',
        filter: `conversation_id=eq.${conversationId}`,
      },
      () => handlers.onEnvelope(),
    )
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'conversations', filter: `id=eq.${conversationId}` },
      () => handlers.onMetadata(),
    )
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'conversation_members',
        filter: `conversation_id=eq.${conversationId}`,
      },
      () => handlers.onMetadata(),
    )
    .subscribe((status) => handlers.onStatus?.(status));
  return () => void client.removeChannel(channel);
}

/** Inbox-wide signal: any new envelope or welcome for conversations I can see. */
export function subscribeToSecureInbox(client: VyboraClient, onChange: () => void): () => void {
  const channel = client
    .channel('connect-inbox')
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'mls_envelopes' }, () =>
      onChange(),
    )
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'mls_welcomes' }, () =>
      onChange(),
    )
    .on('postgres_changes', { event: '*', schema: 'public', table: 'conversations' }, () =>
      onChange(),
    )
    .subscribe();
  return () => void client.removeChannel(channel);
}

const typingSpec: ChannelSpec = {
  config: { private: true, broadcast: { self: false } },
  broadcast: ['typing'],
};
/** One spec per presence topic: the key is the topic's own user, so holders never disagree. */
const presenceSpec = (userId: string): ChannelSpec => ({
  config: { private: true, presence: { key: userId } },
  presence: true,
});
const presenceTopic = (userId: string) => `connect:presence:${userId}`;

/**
 * Ephemeral typing indicators on a private channel (Realtime Authorization
 * restricts it to members). Nothing is stored; sending is skipped entirely
 * when the user disabled typing indicators. The channel is shared (see
 * realtime.ts), so the chat list and the open chat can both join a topic.
 */
export function joinTypingChannel(
  client: VyboraClient,
  conversationId: string,
  userId: string,
  onTyping: (userId: string, typing: boolean) => void,
) {
  const channel = acquireChannel(client, `connect:conv:${conversationId}`, typingSpec);
  channel.onBroadcast('typing', (payload) => {
    const p = (payload ?? {}) as { userId?: string; typing?: boolean };
    if (p.userId && p.userId !== userId) onTyping(p.userId, !!p.typing);
  });
  return {
    send: (typing: boolean) => channel.send('typing', { userId, typing }),
    leave: () => channel.release(),
  };
}

/**
 * Presence: each user announces themselves on their own private channel
 * (only if "show online" is on); people who share a chat may subscribe.
 */
export function announcePresence(client: VyboraClient, userId: string) {
  const channel = acquireChannel(client, presenceTopic(userId), presenceSpec(userId));
  const off = channel.onStatus((status) => {
    if (status === 'SUBSCRIBED') channel.track({ online_at: new Date().toISOString() });
  });
  return () => {
    off();
    channel.untrack();
    channel.release();
  };
}

export function watchPresence(
  client: VyboraClient,
  userIds: string[],
  onChange: (online: Set<string>) => void,
) {
  const online = new Set<string>();
  const channels = [...new Set(userIds.slice(0, 30))].map((id) => {
    const channel = acquireChannel(client, presenceTopic(id), presenceSpec(id));
    channel.onPresenceSync((state) => {
      if (Object.keys(state).length > 0) online.add(id);
      else online.delete(id);
      onChange(new Set(online));
    });
    return channel;
  });
  return () => channels.forEach((c) => c.release());
}

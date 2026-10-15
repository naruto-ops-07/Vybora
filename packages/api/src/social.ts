import type { ProfileView, UserSummary } from '@vybora/types';
import { profileUpdateSchema, type ProfileUpdateInput } from '@vybora/validation';
import { unwrap, type VyboraClient } from './client';

export async function fetchProfile(
  client: VyboraClient,
  username: string,
): Promise<ProfileView | null> {
  const rows = unwrap(await client.rpc('get_profile', { p_username: username }));
  const r = rows[0];
  if (!r) return null;
  return {
    id: r.id!,
    username: r.username!,
    display_name: r.display_name ?? '',
    bio: r.bio ?? '',
    website: r.website,
    avatar_path: r.avatar_path,
    is_private: !!r.is_private,
    status: (r.status ?? 'active') as ProfileView['status'],
    posts_count: r.posts_count ?? 0,
    followers_count: r.followers_count ?? 0,
    following_count: r.following_count ?? 0,
    created_at: r.created_at!,
    is_me: !!r.is_me,
    follow_status: (r.follow_status as ProfileView['follow_status']) ?? null,
    follows_me: !!r.follows_me,
    blocked_by_me: !!r.blocked_by_me,
    muted_by_me: !!r.muted_by_me,
    can_view_content: !!r.can_view_content,
  };
}

export async function fetchMyProfile(client: VyboraClient, userId: string) {
  return unwrap(
    await client
      .from('profiles')
      .select('id, username, display_name, bio, website, avatar_path, is_private, status')
      .eq('id', userId)
      .single(),
  );
}

export async function updateMyProfile(
  client: VyboraClient,
  userId: string,
  input: ProfileUpdateInput,
) {
  const parsed = profileUpdateSchema.parse(input);
  unwrap(await client.from('profiles').update(parsed).eq('id', userId));
}

export async function setAvatarPath(client: VyboraClient, userId: string, path: string | null) {
  unwrap(await client.from('profiles').update({ avatar_path: path }).eq('id', userId));
}

export async function setPrivate(client: VyboraClient, userId: string, isPrivate: boolean) {
  unwrap(await client.from('profiles').update({ is_private: isPrivate }).eq('id', userId));
}

export async function fetchSettings(client: VyboraClient, userId: string) {
  return unwrap(
    await client
      .from('user_settings')
      .select('message_privacy, push_enabled')
      .eq('user_id', userId)
      .single(),
  );
}

export async function updateSettings(
  client: VyboraClient,
  userId: string,
  patch: { message_privacy?: 'everyone' | 'following'; push_enabled?: boolean },
) {
  unwrap(await client.from('user_settings').update(patch).eq('user_id', userId));
}

// ---- follows -------------------------------------------------------

export async function follow(
  client: VyboraClient,
  userId: string,
  targetId: string,
): Promise<'accepted' | 'pending'> {
  const { data, error } = await client
    .from('follows')
    .insert({ follower_id: userId, following_id: targetId })
    .select('status')
    .single();
  if (error) throw error;
  return data.status as 'accepted' | 'pending';
}

/** Unfollow, or cancel a pending request. */
export async function unfollow(client: VyboraClient, userId: string, targetId: string) {
  unwrap(
    await client.from('follows').delete().eq('follower_id', userId).eq('following_id', targetId),
  );
}

export async function removeFollower(client: VyboraClient, userId: string, followerId: string) {
  unwrap(
    await client.from('follows').delete().eq('follower_id', followerId).eq('following_id', userId),
  );
}

export async function respondToFollowRequest(
  client: VyboraClient,
  userId: string,
  requesterId: string,
  accept: boolean,
) {
  if (accept) {
    unwrap(
      await client
        .from('follows')
        .update({ status: 'accepted' })
        .eq('follower_id', requesterId)
        .eq('following_id', userId)
        .eq('status', 'pending'),
    );
  } else {
    unwrap(
      await client
        .from('follows')
        .delete()
        .eq('follower_id', requesterId)
        .eq('following_id', userId)
        .eq('status', 'pending'),
    );
  }
}

export async function fetchFollowRequests(client: VyboraClient) {
  return unwrap(await client.rpc('list_follow_requests')).map((r) => ({
    id: r.id!,
    username: r.username!,
    display_name: r.display_name ?? '',
    avatar_path: r.avatar_path,
    requested_at: r.requested_at!,
  }));
}

export async function fetchFollowList(
  client: VyboraClient,
  userId: string,
  direction: 'followers' | 'following',
  cursor?: { followed_at: string; id: string } | null,
) {
  return unwrap(
    await client.rpc('list_follows', {
      p_user: userId,
      p_direction: direction,
      p_before_created: cursor?.followed_at,
      p_before_id: cursor?.id,
      p_limit: 30,
    }),
  ).map((r) => ({
    id: r.id!,
    username: r.username!,
    display_name: r.display_name ?? '',
    avatar_path: r.avatar_path,
    is_private: !!r.is_private,
    followed_at: r.followed_at!,
  }));
}

// ---- blocks & mutes ---------------------------------------------------

export async function block(client: VyboraClient, userId: string, targetId: string) {
  const { error } = await client
    .from('blocks')
    .insert({ blocker_id: userId, blocked_id: targetId });
  if (error && error.code !== '23505') throw error;
}

export async function unblock(client: VyboraClient, userId: string, targetId: string) {
  unwrap(await client.from('blocks').delete().eq('blocker_id', userId).eq('blocked_id', targetId));
}

export async function mute(client: VyboraClient, userId: string, targetId: string) {
  const { error } = await client.from('mutes').insert({ muter_id: userId, muted_id: targetId });
  if (error && error.code !== '23505') throw error;
}

export async function unmute(client: VyboraClient, userId: string, targetId: string) {
  unwrap(await client.from('mutes').delete().eq('muter_id', userId).eq('muted_id', targetId));
}

export async function fetchBlocked(client: VyboraClient): Promise<UserSummary[]> {
  const rows = unwrap(
    await client
      .from('blocks')
      .select(
        'blocked_id, created_at, profile:profiles!blocks_blocked_id_fkey(id, username, display_name, avatar_path)',
      )
      .order('created_at', { ascending: false }),
  );
  return rows
    .map((r) => r.profile)
    .filter((p): p is NonNullable<typeof p> => !!p)
    .map((p) => ({
      id: p.id,
      username: p.username,
      display_name: p.display_name,
      avatar_path: p.avatar_path,
    }));
}

// ---- discovery ------------------------------------------------------

export async function searchProfiles(client: VyboraClient, query: string): Promise<UserSummary[]> {
  if (!query.trim()) return [];
  return unwrap(await client.rpc('search_profiles', { p_query: query, p_limit: 20 })).map((r) => ({
    id: r.id!,
    username: r.username!,
    display_name: r.display_name ?? '',
    avatar_path: r.avatar_path,
    is_private: !!r.is_private,
    followers_count: r.followers_count ?? 0,
  }));
}

export async function fetchSuggested(client: VyboraClient, limit = 8): Promise<UserSummary[]> {
  return unwrap(await client.rpc('suggested_profiles', { p_limit: limit })).map((r) => ({
    id: r.id!,
    username: r.username!,
    display_name: r.display_name ?? '',
    avatar_path: r.avatar_path,
    followers_count: r.followers_count ?? 0,
  }));
}

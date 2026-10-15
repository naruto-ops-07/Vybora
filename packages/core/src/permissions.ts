/**
 * UI-level permission helpers. They decide what controls to *show*; the
 * database policies decide what is *allowed*. Never rely on these for security.
 */

export type StaffRole = 'admin' | 'moderator';

export function canDeleteComment(
  viewerId: string | null | undefined,
  comment: { author_id: string },
  postAuthorId: string,
): boolean {
  if (!viewerId) return false;
  return comment.author_id === viewerId || postAuthorId === viewerId;
}

export function canEditPost(
  viewerId: string | null | undefined,
  post: { author_id: string; status: string },
): boolean {
  return !!viewerId && post.author_id === viewerId && post.status === 'published';
}

export function isStaff(roles: readonly string[] | undefined): boolean {
  return !!roles?.some((r) => r === 'admin' || r === 'moderator');
}

export function isAdmin(roles: readonly string[] | undefined): boolean {
  return !!roles?.includes('admin');
}

export type FollowButtonState = 'follow' | 'follow_back' | 'requested' | 'following' | 'hidden';

export function followButtonState(profile: {
  is_me: boolean;
  follow_status: 'pending' | 'accepted' | null;
  follows_me: boolean;
  blocked_by_me: boolean;
}): FollowButtonState {
  if (profile.is_me || profile.blocked_by_me) return 'hidden';
  if (profile.follow_status === 'accepted') return 'following';
  if (profile.follow_status === 'pending') return 'requested';
  return profile.follows_me ? 'follow_back' : 'follow';
}

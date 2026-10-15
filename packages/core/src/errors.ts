/**
 * Map Supabase/PostgREST/Postgres errors to user-facing copy. Server error
 * identifiers come from `raise exception '<code>'` in the migrations.
 */
const KNOWN: Record<string, string> = {
  rate_limit_exceeded: 'You’re doing that a lot. Take a short break and try again.',
  comments_disabled: 'Comments are turned off for this post.',
  cannot_message: 'You can’t message this account.',
  recipient_restricts_messages: 'This account only accepts messages from people they follow.',
  blocked: 'This action isn’t available for this account.',
  profile_unavailable: 'This account isn’t available.',
  account_suspended: 'Your account is suspended.',
  post_requires_media: 'Add at least one photo or video.',
  too_many_media: 'You can add up to 10 photos or videos.',
  reel_requires_single_video: 'Reels need exactly one video.',
  media_not_uploaded: 'Your upload didn’t finish. Please try again.',
  media_type_mismatch: 'That file type isn’t supported.',
  media_path_not_owned: 'Upload failed. Please try again.',
  username_reserved: 'That username is reserved.',
  invalid_parent_comment: 'That comment no longer exists.',
  report_target_not_found: 'That content no longer exists.',
  forbidden: 'You don’t have permission to do that.',
  cannot_moderate_self: 'You can’t moderate your own account.',
  cannot_revoke_own_admin: 'You can’t remove your own admin role.',
  'Invalid login credentials': 'Incorrect email or password.',
  'Email not confirmed': 'Please confirm your email address first — check your inbox.',
  'User already registered': 'An account with this email already exists.',
};

export interface ErrorLike {
  message?: string;
  code?: string;
  details?: string | null;
  hint?: string | null;
  status?: number;
}

export function friendlyError(
  error: unknown,
  fallback = 'Something went wrong. Please try again.',
): string {
  if (!error) return fallback;
  const e = error as ErrorLike;
  const message = typeof e.message === 'string' ? e.message : String(error);
  for (const [needle, copy] of Object.entries(KNOWN)) {
    if (message.includes(needle)) return copy;
  }
  if (e.code === '23505' || message.includes('duplicate key')) {
    if (message.includes('profiles_username_key')) return 'That username is taken.';
    return 'That already exists.';
  }
  if (
    e.code === '42501' ||
    message.includes('row-level security') ||
    message.includes('permission denied')
  ) {
    return 'You don’t have permission to do that.';
  }
  if (e.code === '23514' || message.includes('check constraint'))
    return 'Some details aren’t valid. Please review and try again.';
  if (
    message.includes('Failed to fetch') ||
    message.includes('Network request failed') ||
    message.includes('NetworkError')
  ) {
    return 'You appear to be offline. Check your connection and try again.';
  }
  return fallback;
}

export function isRetryable(error: unknown): boolean {
  const e = error as ErrorLike;
  const message = e?.message ?? '';
  if (typeof e?.status === 'number' && e.status >= 500) return true;
  return /Failed to fetch|Network request failed|NetworkError|timeout/i.test(message);
}

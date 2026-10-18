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
  // The inbox holds a code that password sign-in can't take: signing in by code confirms it.
  'Email not confirmed': 'Your email isn’t confirmed yet. Sign in with a code to confirm it.',
  'User already registered': 'An account with this email already exists.',
};

const CANT_EMAIL = 'We couldn’t send an email to that address. Try again later.';
const EMAIL_LIMIT = 'Too many emails were sent just now. Wait a few minutes, then try again.';
const SIGNUP_FAILED =
  'We couldn’t create your account. Try a different username, or try again in a minute.';

/**
 * Supabase Auth failures, by error `code` and by message (older servers send
 * only the message). "Email address not authorized" is the built-in mailer
 * refusing addresses outside the project team until custom SMTP is set up.
 */
const AUTH_CODES: Record<string, string> = {
  email_address_not_authorized: CANT_EMAIL,
  over_email_send_rate_limit: EMAIL_LIMIT,
  weak_password: 'Choose a stronger password: at least 8 characters with a letter and a number.',
  email_address_invalid: 'Enter a valid email address.',
  signup_disabled: 'New sign-ups are paused right now.',
};
const AUTH_MESSAGES: Record<string, string> = {
  'Email address not authorized': CANT_EMAIL,
  'Error sending confirmation email': CANT_EMAIL,
  'Error sending magic link email': CANT_EMAIL,
  'Error sending recovery email': CANT_EMAIL,
  'email rate limit exceeded': EMAIL_LIMIT,
  'Database error saving new user': SIGNUP_FAILED,
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
  // Own keys only: a code like `constructor` must not reach Object.prototype.
  if (typeof e.code === 'string' && Object.hasOwn(AUTH_CODES, e.code)) return AUTH_CODES[e.code]!;
  for (const [needle, copy] of Object.entries({ ...AUTH_MESSAGES, ...KNOWN })) {
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

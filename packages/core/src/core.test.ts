import { describe, expect, it } from 'vitest';
import {
  activeMention,
  canDeleteComment,
  compareFeedOrder,
  detectMime,
  engagementScore,
  extractHashtags,
  feedAspectRatio,
  flattenUnique,
  followButtonState,
  formatCount,
  formatDuration,
  formatRelativeTime,
  friendlyError,
  nextStory,
  previousStory,
  scoreCursorOf,
  storagePaths,
  storyTimeLeft,
  timeCursorOf,
  tokenizeText,
  truncate,
} from './index';

describe('tokenizeText', () => {
  it('splits hashtags, mentions and links without producing markup', () => {
    const tokens = tokenizeText('Sunset with @Maya.Rose. #Golden_Hour see https://vybora.app/x).');
    expect(tokens).toEqual([
      { type: 'text', value: 'Sunset with ' },
      { type: 'mention', value: '@maya.rose', username: 'maya.rose' },
      { type: 'text', value: '.' },
      { type: 'text', value: ' ' },
      { type: 'hashtag', value: '#Golden_Hour', tag: 'golden_hour' },
      { type: 'text', value: ' see ' },
      { type: 'url', value: 'https://vybora.app/x', href: 'https://vybora.app/x' },
      { type: 'text', value: ').' },
    ]);
  });

  it('treats script-like input as plain text', () => {
    expect(tokenizeText('<img src=x onerror=alert(1)>')).toEqual([
      { type: 'text', value: '<img src=x onerror=alert(1)>' },
    ]);
  });
});

describe('extractHashtags', () => {
  it('lowercases, dedupes and caps at 30', () => {
    expect(extractHashtags('#A #a #b')).toEqual(['a', 'b']);
    const many = Array.from({ length: 40 }, (_, i) => `#t${i}`).join(' ');
    expect(extractHashtags(many)).toHaveLength(30);
  });
});

describe('activeMention', () => {
  it('finds the mention being typed', () => {
    expect(activeMention('hello @ma', 9)).toBe('ma');
    expect(activeMention('email@domain', 12)).toBeNull();
  });
});

describe('format helpers', () => {
  const now = new Date('2026-10-09T12:00:00Z');
  it('formats relative time', () => {
    expect(formatRelativeTime('2026-10-09T11:59:30Z', now)).toBe('now');
    expect(formatRelativeTime('2026-10-09T11:55:00Z', now)).toBe('5m');
    expect(formatRelativeTime('2026-10-09T09:00:00Z', now)).toBe('3h');
    expect(formatRelativeTime('2026-10-07T12:00:00Z', now)).toBe('2d');
    expect(formatRelativeTime('2026-09-18T12:00:00Z', now)).toBe('3w');
  });
  it('formats counts compactly', () => {
    expect(formatCount(999)).toBe('999');
    expect(formatCount(1000)).toBe('1K');
    expect(formatCount(1250)).toBe('1.2K');
    expect(formatCount(153_000)).toBe('153K');
    expect(formatCount(2_000_000)).toBe('2M');
  });
  it('formats durations and truncates', () => {
    expect(formatDuration(65_000)).toBe('1:05');
    expect(truncate('abcdef', 4)).toBe('abc…');
    expect(truncate('abc', 4)).toBe('abc');
  });
});

describe('pagination', () => {
  const rows = [
    { id: 'c', created_at: '2026-10-09T10:00:00Z', like_count: 3, comment_count: 1 },
    { id: 'b', created_at: '2026-10-09T09:00:00Z', like_count: 0, comment_count: 0 },
  ];
  it('produces a cursor only for full pages', () => {
    expect(timeCursorOf(rows, 2)).toEqual({ id: 'b', created_at: '2026-10-09T09:00:00Z' });
    expect(timeCursorOf(rows, 3)).toBeNull();
  });
  it('computes the same engagement score as SQL', () => {
    expect(engagementScore(rows[0]!)).toBe(5);
    expect(scoreCursorOf(rows, 2)).toEqual({
      id: 'b',
      created_at: '2026-10-09T09:00:00Z',
      score: 0,
    });
  });
  it('flattens pages without duplicates', () => {
    const merged = flattenUnique([
      [{ id: '1' }, { id: '2' }],
      [{ id: '2' }, { id: '3' }],
    ]);
    expect(merged.map((r) => r.id)).toEqual(['1', '2', '3']);
    expect(flattenUnique(undefined)).toEqual([]);
  });
  it('orders by created_at desc then id desc', () => {
    const a = { id: 'a', created_at: '2026-01-01' };
    const b = { id: 'b', created_at: '2026-01-01' };
    expect(compareFeedOrder(b, a)).toBeLessThan(0);
    expect(compareFeedOrder({ id: 'z', created_at: '2025-01-01' }, a)).toBeGreaterThan(0);
  });
});

describe('detectMime', () => {
  const pad = (arr: number[]) => new Uint8Array([...arr, ...new Array(16).fill(0)]);
  const text = (s: string) => [...s].map((c) => c.charCodeAt(0));
  it('detects by signature, not extension', () => {
    expect(detectMime(pad([0xff, 0xd8, 0xff, 0xe0]))).toBe('image/jpeg');
    expect(detectMime(pad([0x89, ...text('PNG')]))).toBe('image/png');
    expect(detectMime(pad(text('GIF89a')))).toBe('image/gif');
    expect(detectMime(pad([...text('RIFF'), 0, 0, 0, 0, ...text('WEBP')]))).toBe('image/webp');
    expect(detectMime(pad([0, 0, 0, 0x18, ...text('ftypisom')]))).toBe('video/mp4');
    expect(detectMime(pad([0, 0, 0, 0x14, ...text('ftypqt  ')]))).toBe('video/quicktime');
    expect(detectMime(pad([0x1a, 0x45, 0xdf, 0xa3]))).toBe('video/webm');
  });
  it('rejects unknown and disguised files', () => {
    expect(detectMime(pad(text('<svg xmlns=')))).toBeNull();
    expect(detectMime(pad(text('MZ')))).toBeNull();
    expect(detectMime(pad([0, 0, 0, 0x18, ...text('ftypheic')]))).toBeNull();
    expect(detectMime(new Uint8Array([0xff, 0xd8]))).toBeNull();
  });
});

describe('media helpers', () => {
  it('builds storage paths that match RLS folder rules', () => {
    expect(storagePaths.media('u1', 'abc', 'image/jpeg')).toBe('u1/abc.jpg');
    expect(storagePaths.dm('c1', 'u1', 'abc', 'image/png')).toBe('c1/u1/abc.png');
  });
  it('clamps feed aspect ratios', () => {
    expect(feedAspectRatio(1080, 1920)).toBe(0.8);
    expect(feedAspectRatio(4000, 1000)).toBe(1.91);
    expect(feedAspectRatio(null, null)).toBe(1);
  });
});

describe('friendlyError', () => {
  it('maps server error identifiers to copy', () => {
    expect(friendlyError({ message: 'rate_limit_exceeded' })).toMatch(/break/);
    expect(friendlyError({ message: 'Invalid login credentials' })).toBe(
      'Incorrect email or password.',
    );
    expect(
      friendlyError({
        code: '23505',
        message: 'duplicate key value violates unique constraint "profiles_username_key"',
      }),
    ).toBe('That username is taken.');
    expect(friendlyError({ message: 'new row violates row-level security policy' })).toMatch(
      /permission/,
    );
    expect(friendlyError(new TypeError('Failed to fetch'))).toMatch(/offline/);
    expect(friendlyError({ message: 'weird' }, 'fallback')).toBe('fallback');
  });

  it('points an unconfirmed account at signing in with a code', () => {
    expect(friendlyError({ code: 'email_not_confirmed', message: 'Email not confirmed' })).toBe(
      'Your email isn’t confirmed yet. Sign in with a code to confirm it.',
    );
  });

  it('only matches its own auth codes, never Object.prototype keys', () => {
    for (const code of ['constructor', 'toString', '__proto__', 'hasOwnProperty']) {
      expect(friendlyError({ code, message: 'weird' }, 'fallback')).toBe('fallback');
    }
  });

  it('names the Supabase Auth email and sign-up failures instead of a generic error', () => {
    const cantEmail = 'We couldn’t send an email to that address. Try again later.';
    expect(
      friendlyError({
        code: 'email_address_not_authorized',
        message: 'Email address not authorized',
      }),
    ).toBe(cantEmail);
    expect(friendlyError({ status: 500, message: 'Error sending confirmation email' })).toBe(
      cantEmail,
    );
    expect(friendlyError({ message: 'Error sending magic link email' })).toBe(cantEmail);
    expect(
      friendlyError({
        status: 429,
        code: 'over_email_send_rate_limit',
        message: 'email rate limit exceeded',
      }),
    ).toBe('Too many emails were sent just now. Wait a few minutes, then try again.');
    expect(
      friendlyError({
        code: 'weak_password',
        message: 'Password should be at least 8 characters.',
      }),
    ).toBe('Choose a stronger password: at least 8 characters with a letter and a number.');
    expect(
      friendlyError({ code: 'email_address_invalid', message: 'Email address "x" is invalid' }),
    ).toBe('Enter a valid email address.');
    expect(
      friendlyError({ code: 'signup_disabled', message: 'Signups not allowed for this instance' }),
    ).toBe('New sign-ups are paused right now.');
    expect(friendlyError({ status: 500, message: 'Database error saving new user' })).toBe(
      'We couldn’t create your account. Try a different username, or try again in a minute.',
    );
  });
});

describe('permissions', () => {
  it('shows comment delete only to comment or post authors', () => {
    expect(canDeleteComment('a', { author_id: 'a' }, 'p')).toBe(true);
    expect(canDeleteComment('p', { author_id: 'a' }, 'p')).toBe(true);
    expect(canDeleteComment('x', { author_id: 'a' }, 'p')).toBe(false);
    expect(canDeleteComment(null, { author_id: 'a' }, 'p')).toBe(false);
  });
  it('derives follow button state', () => {
    const base = {
      is_me: false,
      follow_status: null,
      follows_me: false,
      blocked_by_me: false,
    } as const;
    expect(followButtonState(base)).toBe('follow');
    expect(followButtonState({ ...base, follows_me: true })).toBe('follow_back');
    expect(followButtonState({ ...base, follow_status: 'pending' })).toBe('requested');
    expect(followButtonState({ ...base, follow_status: 'accepted' })).toBe('following');
    expect(followButtonState({ ...base, is_me: true })).toBe('hidden');
  });
});

describe('stories', () => {
  it('advances across groups and stops at the end', () => {
    expect(nextStory({ group: 0, item: 0 }, [2, 1])).toEqual({ group: 0, item: 1 });
    expect(nextStory({ group: 0, item: 1 }, [2, 0, 1])).toEqual({ group: 2, item: 0 });
    expect(nextStory({ group: 1, item: 0 }, [2, 1])).toBeNull();
  });
  it('goes back across groups', () => {
    expect(previousStory({ group: 1, item: 0 }, [2, 1])).toEqual({ group: 0, item: 1 });
    expect(previousStory({ group: 0, item: 0 }, [2, 1])).toEqual({ group: 0, item: 0 });
  });
  it('labels remaining time', () => {
    const now = new Date('2026-10-09T12:00:00Z');
    expect(storyTimeLeft('2026-10-10T11:00:00Z', now)).toBe('23h left');
    expect(storyTimeLeft('2026-10-09T12:30:00Z', now)).toBe('30m left');
    expect(storyTimeLeft('2026-10-09T11:00:00Z', now)).toBe('Expired');
  });
});

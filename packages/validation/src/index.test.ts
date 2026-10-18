import { describe, expect, it } from 'vitest';
import {
  commentSchema,
  emailCodeSchema,
  newPasswordSchema,
  profileUpdateSchema,
  publicEnvSchema,
  signUpSchema,
  usernameSchema,
  validateMediaFile,
} from './index';

describe('usernameSchema', () => {
  it.each(['maya', 'maya.rose', 'm_42', 'abc'])('accepts %s', (v) => {
    expect(usernameSchema.safeParse(v).success).toBe(true);
  });
  it.each(['ab', '.maya', 'maya.', 'ma..ya', 'maya!', 'admin', 'a'.repeat(31)])(
    'rejects %s',
    (v) => {
      expect(usernameSchema.safeParse(v).success).toBe(false);
    },
  );
  it('normalizes case and whitespace', () => {
    expect(usernameSchema.parse('  Maya.Rose ')).toBe('maya.rose');
  });
});

describe('signUpSchema', () => {
  it('requires a letter and a number in passwords', () => {
    const base = { email: 'a@b.co', username: 'maya' };
    expect(signUpSchema.safeParse({ ...base, password: 'onlyletters' }).success).toBe(false);
    expect(signUpSchema.safeParse({ ...base, password: '12345678' }).success).toBe(false);
    expect(signUpSchema.safeParse({ ...base, password: 'letters123' }).success).toBe(true);
  });
  it('rejects malformed email', () => {
    expect(
      signUpSchema.safeParse({ email: 'nope', password: 'letters123', username: 'maya' }).success,
    ).toBe(false);
  });
});

describe('newPasswordSchema', () => {
  it('requires matching confirmation', () => {
    const r = newPasswordSchema.safeParse({ password: 'letters123', confirm: 'letters124' });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0]?.path).toEqual(['confirm']);
  });
});

describe('profileUpdateSchema', () => {
  it('normalizes website links and empty values', () => {
    const base = { username: 'maya', display_name: 'Maya', bio: '' };
    expect(profileUpdateSchema.parse({ ...base, website: 'maya.studio' }).website).toBe(
      'https://maya.studio',
    );
    expect(profileUpdateSchema.parse({ ...base, website: '' }).website).toBeNull();
    expect(profileUpdateSchema.safeParse({ ...base, website: 'not a link' }).success).toBe(false);
  });
  it('enforces bio length', () => {
    const r = profileUpdateSchema.safeParse({
      username: 'maya',
      display_name: '',
      bio: 'x'.repeat(301),
      website: '',
    });
    expect(r.success).toBe(false);
  });
});

describe('commentSchema', () => {
  it('trims and rejects empty comments', () => {
    expect(commentSchema.safeParse('   ').success).toBe(false);
    expect(commentSchema.parse('  nice  ')).toBe('nice');
  });
});

describe('validateMediaFile', () => {
  const mb = 1024 * 1024;
  it('accepts supported images and videos for posts', () => {
    expect(validateMediaFile({ type: 'image/jpeg', size: 2 * mb }, 'post')).toBeNull();
    expect(validateMediaFile({ type: 'video/mp4', size: 50 * mb }, 'post')).toBeNull();
  });
  it('rejects unsupported or oversized files', () => {
    expect(validateMediaFile({ type: 'image/svg+xml', size: 1 }, 'post')).toMatch(/Unsupported/);
    expect(validateMediaFile({ type: 'image/png', size: 16 * mb }, 'post')).toMatch(/15 MB/);
    expect(validateMediaFile({ type: 'image/png', size: 1 }, 'reel')).toMatch(/Reels/);
    expect(validateMediaFile({ type: 'image/gif', size: 1 }, 'avatar')).toMatch(/JPEG/);
    expect(validateMediaFile({ type: 'video/mp4', size: 1 }, 'dm')).toMatch(/Only images/);
  });
});

describe('publicEnvSchema', () => {
  it('fails clearly for missing configuration', () => {
    const r = publicEnvSchema.safeParse({ supabaseUrl: '', supabaseAnonKey: '' });
    expect(r.success).toBe(false);
  });
});

describe('emailCodeSchema', () => {
  it('accepts a 6-digit code and rejects anything else', () => {
    expect(emailCodeSchema.parse(' 123456 ')).toBe('123456');
    for (const bad of ['12345', '1234567', '12a456', ''])
      expect(emailCodeSchema.safeParse(bad).success).toBe(false);
  });
});

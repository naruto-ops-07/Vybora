import { z } from 'zod';

/**
 * Shared validation. These mirror (never replace) the database CHECK
 * constraints so users get instant, friendly feedback; the database remains
 * the authority.
 */

export const LIMITS = {
  usernameMin: 3,
  usernameMax: 30,
  displayName: 60,
  bio: 300,
  website: 200,
  caption: 2200,
  altText: 500,
  comment: 1000,
  message: 2000,
  reportDetails: 1000,
  mediaPerPost: 10,
  imageBytes: 15 * 1024 * 1024,
  videoBytes: 100 * 1024 * 1024,
  avatarBytes: 5 * 1024 * 1024,
  dmAttachmentBytes: 10 * 1024 * 1024,
  reelMaxMs: 180_000,
  storyVideoMaxMs: 60_000,
} as const;

export const IMAGE_MIME = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'] as const;
export const VIDEO_MIME = ['video/mp4', 'video/quicktime', 'video/webm'] as const;
export const AVATAR_MIME = ['image/jpeg', 'image/png', 'image/webp'] as const;

const RESERVED = new Set([
  'admin',
  'administrator',
  'root',
  'support',
  'help',
  'vybora',
  'official',
  'staff',
  'moderator',
  'mod',
  'security',
  'system',
  'api',
  'www',
  'about',
  'explore',
  'reels',
  'messages',
  'inbox',
  'settings',
  'login',
  'signup',
  'logout',
  'null',
  'undefined',
]);

export const usernameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(LIMITS.usernameMin, `Use at least ${LIMITS.usernameMin} characters`)
  .max(LIMITS.usernameMax, `Use at most ${LIMITS.usernameMax} characters`)
  .regex(/^[a-z0-9._]+$/, 'Only letters, numbers, periods and underscores')
  .refine((v) => !v.startsWith('.') && !v.endsWith('.'), 'Cannot start or end with a period')
  .refine((v) => !v.includes('..'), 'Cannot contain consecutive periods')
  .refine((v) => !RESERVED.has(v), 'This username is reserved');

export const emailSchema = z.string().trim().toLowerCase().email('Enter a valid email address');

/** The one-time code emailed for sign-up confirmation and code sign-in. */
export const emailCodeSchema = z
  .string()
  .trim()
  .regex(/^\d{6}$/, 'Enter the 6-digit code');

export const passwordSchema = z
  .string()
  .min(8, 'Use at least 8 characters')
  .max(72, 'Use at most 72 characters')
  .refine((v) => /[a-zA-Z]/.test(v) && /\d/.test(v), 'Include at least one letter and one number');

export const signUpSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  username: usernameSchema,
  displayName: z.string().trim().max(LIMITS.displayName).optional().default(''),
});
export type SignUpInput = z.input<typeof signUpSchema>;

export const signInSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Enter your password'),
});
export type SignInInput = z.infer<typeof signInSchema>;

export const resetRequestSchema = z.object({ email: emailSchema });
export const newPasswordSchema = z
  .object({ password: passwordSchema, confirm: z.string() })
  .refine((v) => v.password === v.confirm, {
    message: 'Passwords do not match',
    path: ['confirm'],
  });

const websiteSchema = z
  .string()
  .trim()
  .max(LIMITS.website)
  .transform((v) => (v === '' ? null : /^https?:\/\//i.test(v) ? v : `https://${v}`))
  .refine((v) => v === null || /^https?:\/\/[^\s.]+\.[^\s]+$/i.test(v), 'Enter a valid link')
  .nullable();

export const profileUpdateSchema = z.object({
  username: usernameSchema,
  display_name: z
    .string()
    .trim()
    .max(LIMITS.displayName, `At most ${LIMITS.displayName} characters`),
  bio: z.string().max(LIMITS.bio, `At most ${LIMITS.bio} characters`),
  website: websiteSchema,
});
export type ProfileUpdateInput = z.input<typeof profileUpdateSchema>;

export const captionSchema = z.string().max(LIMITS.caption, `At most ${LIMITS.caption} characters`);
export const altTextSchema = z.string().max(LIMITS.altText).optional();

export const commentSchema = z
  .string()
  .trim()
  .min(1, 'Write something first')
  .max(LIMITS.comment, `At most ${LIMITS.comment} characters`);

export const messageSchema = z
  .string()
  .trim()
  .max(LIMITS.message, `At most ${LIMITS.message} characters`);

export const reportSchema = z.object({
  reason: z.enum([
    'spam',
    'harassment',
    'hate',
    'violence',
    'nudity',
    'self_harm',
    'misinformation',
    'intellectual_property',
    'other',
  ]),
  details: z.string().trim().max(LIMITS.reportDetails).optional(),
});
export type ReportInput = z.infer<typeof reportSchema>;

export type MediaPurpose = 'post' | 'reel' | 'story' | 'avatar' | 'dm';

export interface FileLike {
  size: number;
  type: string;
  name?: string;
}

/** Client-side media gate. Content sniffing lives in @vybora/core (detectMime). */
export function validateMediaFile(file: FileLike, purpose: MediaPurpose): string | null {
  const type = file.type.toLowerCase();
  const isImage = (IMAGE_MIME as readonly string[]).includes(type);
  const isVideo = (VIDEO_MIME as readonly string[]).includes(type);
  switch (purpose) {
    case 'avatar':
      if (!(AVATAR_MIME as readonly string[]).includes(type))
        return 'Use a JPEG, PNG or WebP image';
      if (file.size > LIMITS.avatarBytes) return 'Profile photos must be 5 MB or smaller';
      return null;
    case 'dm':
      if (!isImage) return 'Only images can be sent in messages';
      if (file.size > LIMITS.dmAttachmentBytes) return 'Images must be 10 MB or smaller';
      return null;
    case 'reel':
      if (!isVideo) return 'Reels must be MP4, MOV or WebM videos';
      if (file.size > LIMITS.videoBytes) return 'Videos must be 100 MB or smaller';
      return null;
    case 'post':
    case 'story':
      if (!isImage && !isVideo) return 'Unsupported file type';
      if (isImage && file.size > LIMITS.imageBytes) return 'Images must be 15 MB or smaller';
      if (isVideo && file.size > LIMITS.videoBytes) return 'Videos must be 100 MB or smaller';
      return null;
  }
}

/** Public client configuration — validated at startup by each app. */
export const publicEnvSchema = z.object({
  supabaseUrl: z.string().url('SUPABASE_URL must be a valid URL'),
  supabaseAnonKey: z.string().min(20, 'SUPABASE_ANON_KEY looks invalid'),
  siteUrl: z.string().url().optional(),
});
export type PublicEnv = z.infer<typeof publicEnvSchema>;

export { z };

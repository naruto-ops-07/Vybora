export type SniffedMime =
  | 'image/jpeg'
  | 'image/png'
  | 'image/gif'
  | 'image/webp'
  | 'video/mp4'
  | 'video/quicktime'
  | 'video/webm';

const ascii = (bytes: Uint8Array, start: number, len: number) =>
  String.fromCharCode(...bytes.subarray(start, start + len));

/**
 * Detect a media type from file signature ("magic bytes"), not the extension
 * or the browser-reported type. Pass at least the first 16 bytes.
 */
export function detectMime(bytes: Uint8Array): SniffedMime | null {
  if (bytes.length < 12) return null;
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if (bytes[0] === 0x89 && ascii(bytes, 1, 3) === 'PNG') return 'image/png';
  if (ascii(bytes, 0, 4) === 'GIF8') return 'image/gif';
  if (ascii(bytes, 0, 4) === 'RIFF' && ascii(bytes, 8, 4) === 'WEBP') return 'image/webp';
  if (bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3)
    return 'video/webm';
  if (ascii(bytes, 4, 4) === 'ftyp') {
    const brand = ascii(bytes, 8, 4);
    if (brand === 'qt  ') return 'video/quicktime';
    // HEIC/AVIF still images share the ISO-BMFF container; reject them here.
    if (['heic', 'heix', 'mif1', 'msf1', 'avif'].includes(brand)) return null;
    return 'video/mp4';
  }
  return null;
}

export function isVideoMime(mime: string): boolean {
  return mime.startsWith('video/');
}

export function extensionForMime(mime: string): string {
  switch (mime) {
    case 'image/jpeg':
      return 'jpg';
    case 'image/png':
      return 'png';
    case 'image/gif':
      return 'gif';
    case 'image/webp':
      return 'webp';
    case 'video/mp4':
      return 'mp4';
    case 'video/quicktime':
      return 'mov';
    case 'video/webm':
      return 'webm';
    default:
      return 'bin';
  }
}

/** Storage paths — must match the RLS folder conventions in 0007_storage_realtime.sql. */
export const storagePaths = {
  avatar: (userId: string, id: string, mime: string) => `${userId}/${id}.${extensionForMime(mime)}`,
  media: (userId: string, id: string, mime: string) => `${userId}/${id}.${extensionForMime(mime)}`,
  dm: (conversationId: string, userId: string, id: string, mime: string) =>
    `${conversationId}/${userId}/${id}.${extensionForMime(mime)}`,
};

/** Fit media into a box while keeping aspect ratio; clamps feed aspect to 4:5 … 1.91:1. */
export function feedAspectRatio(width: number | null, height: number | null): number {
  if (!width || !height) return 1;
  const ratio = width / height;
  return Math.min(1.91, Math.max(0.8, ratio));
}

/** Simple RFC4122 v4 generator that works in browsers, RN (Hermes) and Node. */
export function uuid(): string {
  const g = globalThis as { crypto?: { randomUUID?: () => string } };
  if (g.crypto?.randomUUID) return g.crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

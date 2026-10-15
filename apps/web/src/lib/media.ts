import { detectMime } from '@vybora/core';
import { validateMediaFile, type MediaPurpose } from '@vybora/validation';

export interface PickedMedia {
  id: string;
  file: File;
  /** Upload body — may be a downscaled re-encode of `file`. */
  body: Blob;
  mime: string;
  mediaType: 'image' | 'video';
  previewUrl: string;
  width: number | null;
  height: number | null;
  durationMs: number | null;
  altText: string;
}

const MAX_EDGE = 2048;

/** Read the file signature and validate type + size. Throws a user-facing message. */
export async function inspectFile(
  file: File,
  purpose: MediaPurpose,
): Promise<{ mime: string; mediaType: 'image' | 'video' }> {
  const head = new Uint8Array(await file.slice(0, 32).arrayBuffer());
  const mime = detectMime(head);
  if (!mime) throw new Error(`${file.name}: unsupported or unrecognized file`);
  const problem = validateMediaFile({ size: file.size, type: mime }, purpose);
  if (problem) throw new Error(`${file.name}: ${problem}`);
  return { mime, mediaType: mime.startsWith('video/') ? 'video' : 'image' };
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Could not read image'));
    img.src = url;
  });
}

function loadVideoMeta(
  url: string,
): Promise<{ width: number; height: number; durationMs: number }> {
  return new Promise((resolve, reject) => {
    const v = document.createElement('video');
    v.preload = 'metadata';
    v.muted = true;
    v.onloadedmetadata = () =>
      resolve({
        width: v.videoWidth,
        height: v.videoHeight,
        durationMs: Math.round(v.duration * 1000),
      });
    v.onerror = () => reject(new Error('Could not read video'));
    v.src = url;
  });
}

/**
 * Prepare a picked file: verify, read dimensions, and downscale large still
 * images to ≤2048px on the longest edge (GIFs are kept to preserve animation).
 * This is genuine client-side resizing — no server transcoding happens.
 */
export async function prepareFile(file: File, purpose: MediaPurpose): Promise<PickedMedia> {
  const { mime, mediaType } = await inspectFile(file, purpose);
  const previewUrl = URL.createObjectURL(file);
  const id = crypto.randomUUID();

  if (mediaType === 'video') {
    const meta = await loadVideoMeta(previewUrl);
    if (purpose === 'story' && meta.durationMs > 60_000)
      throw new Error(`${file.name}: story videos can be up to 60 seconds`);
    if (meta.durationMs > 180_000) throw new Error(`${file.name}: videos can be up to 3 minutes`);
    return {
      id,
      file,
      body: file,
      mime,
      mediaType,
      previewUrl,
      width: meta.width,
      height: meta.height,
      durationMs: meta.durationMs,
      altText: '',
    };
  }

  const img = await loadImage(previewUrl);
  let body: Blob = file;
  let outMime = mime;
  let { naturalWidth: width, naturalHeight: height } = img;
  const longest = Math.max(width, height);
  if (mime !== 'image/gif' && longest > MAX_EDGE) {
    const scale = MAX_EDGE / longest;
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(width * scale);
    canvas.height = Math.round(height * scale);
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/jpeg', 0.88));
      if (blob) {
        body = blob;
        outMime = 'image/jpeg';
        width = canvas.width;
        height = canvas.height;
      }
    }
  }
  return {
    id,
    file,
    body,
    mime: outMime,
    mediaType,
    previewUrl,
    width,
    height,
    durationMs: null,
    altText: '',
  };
}

export function releasePreview(m: Pick<PickedMedia, 'previewUrl'>) {
  URL.revokeObjectURL(m.previewUrl);
}

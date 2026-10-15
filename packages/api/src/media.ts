import { detectMime, storagePaths, uuid } from '@vybora/core';
import { validateMediaFile, type MediaPurpose } from '@vybora/validation';
import type { VyboraClient } from './client';

export type Bucket = 'avatars' | 'media' | 'dm';

export interface UploadOptions {
  bucket: Bucket;
  path: string;
  body: Blob | ArrayBuffer;
  contentType: string;
  onProgress?: (fraction: number) => void;
  signal?: AbortSignal;
}

export class UploadCancelledError extends Error {
  constructor() {
    super('upload_cancelled');
  }
}

/**
 * Upload to Supabase Storage with real progress + cancellation (XHR works in
 * browsers and React Native). Access is enforced by Storage RLS using the
 * caller's JWT; buckets enforce size and MIME allow-lists server-side.
 */
export async function uploadObject(
  client: VyboraClient,
  supabaseUrl: string,
  anonKey: string,
  opts: UploadOptions,
) {
  const { data } = await client.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error('not_authenticated');
  const url = `${supabaseUrl.replace(/\/$/, '')}/storage/v1/object/${opts.bucket}/${opts.path
    .split('/')
    .map(encodeURIComponent)
    .join('/')}`;

  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', url);
    xhr.setRequestHeader('Authorization', `Bearer ${token}`);
    xhr.setRequestHeader('apikey', anonKey);
    xhr.setRequestHeader('Content-Type', opts.contentType);
    xhr.setRequestHeader('x-upsert', 'false');
    xhr.setRequestHeader('cache-control', 'max-age=3600');
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) opts.onProgress?.(e.loaded / e.total);
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        opts.onProgress?.(1);
        resolve();
      } else {
        let message = `upload_failed_${xhr.status}`;
        try {
          const body = JSON.parse(xhr.responseText) as { message?: string; error?: string };
          message = body.message ?? body.error ?? message;
        } catch {
          /* non-JSON error body */
        }
        reject(new Error(message));
      }
    };
    xhr.onerror = () => reject(new Error('Network request failed'));
    xhr.onabort = () => reject(new UploadCancelledError());
    if (opts.signal) {
      if (opts.signal.aborted) {
        reject(new UploadCancelledError());
        return;
      }
      opts.signal.addEventListener('abort', () => xhr.abort(), { once: true });
    }
    xhr.send(opts.body);
  });
  return { bucket: opts.bucket, path: opts.path };
}

export async function removeObjects(client: VyboraClient, bucket: Bucket, paths: string[]) {
  if (!paths.length) return;
  const { error } = await client.storage.from(bucket).remove(paths);
  if (error) throw error;
}

export interface PreparedMedia {
  mime: string;
  mediaType: 'image' | 'video';
}

/**
 * Validate a file before upload: allow-list + size limits, then confirm the
 * real type from its magic bytes (never trust the extension).
 */
export async function prepareMedia(
  file: { size: number; type: string; slice?: (start: number, end: number) => Blob },
  head: Uint8Array,
  purpose: MediaPurpose,
): Promise<PreparedMedia> {
  const sniffed = detectMime(head);
  if (!sniffed) throw new Error('media_type_mismatch');
  const problem = validateMediaFile({ size: file.size, type: sniffed }, purpose);
  if (problem) throw new Error(problem);
  return { mime: sniffed, mediaType: sniffed.startsWith('video/') ? 'video' : 'image' };
}

export function newMediaPath(userId: string, mime: string) {
  return storagePaths.media(userId, uuid(), mime);
}

// ---------------------------------------------------------------------
// Signed URL resolution for private media (cached, batched)
// ---------------------------------------------------------------------

const SIGNED_TTL_SECONDS = 60 * 60;
const REFRESH_MARGIN_MS = 5 * 60 * 1000;
const signedCache = new Map<string, { url: string; expiresAt: number }>();

function cacheKey(bucket: Bucket, path: string) {
  return `${bucket}:${path}`;
}

export function cachedSignedUrl(bucket: Bucket, path: string): string | null {
  const hit = signedCache.get(cacheKey(bucket, path));
  if (hit && hit.expiresAt - REFRESH_MARGIN_MS > Date.now()) return hit.url;
  return null;
}

/** Resolve many private object paths to short-lived signed URLs in one request. */
export async function resolveSignedUrls(
  client: VyboraClient,
  bucket: Bucket,
  paths: string[],
): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  const missing: string[] = [];
  for (const p of new Set(paths)) {
    const hit = cachedSignedUrl(bucket, p);
    if (hit) out[p] = hit;
    else missing.push(p);
  }
  if (missing.length) {
    const { data, error } = await client.storage
      .from(bucket)
      .createSignedUrls(missing, SIGNED_TTL_SECONDS);
    if (error) throw error;
    const expiresAt = Date.now() + SIGNED_TTL_SECONDS * 1000;
    for (const item of data ?? []) {
      if (item.path && item.signedUrl) {
        signedCache.set(cacheKey(bucket, item.path), { url: item.signedUrl, expiresAt });
        out[item.path] = item.signedUrl;
      }
    }
  }
  return out;
}

export function clearSignedUrlCache() {
  signedCache.clear();
}

/**
 * Coalesces individual signed-URL lookups made during the same render pass
 * into a single `createSignedUrls` request (avoids N+1 across a feed page).
 */
export function createSignedUrlBatcher(client: VyboraClient, bucket: Bucket, windowMs = 12) {
  let pending = new Map<
    string,
    { resolve: (url: string) => void; reject: (e: unknown) => void }[]
  >();
  let timer: ReturnType<typeof setTimeout> | null = null;

  const flush = async () => {
    const batch = pending;
    pending = new Map();
    timer = null;
    try {
      const urls = await resolveSignedUrls(client, bucket, [...batch.keys()]);
      for (const [path, waiters] of batch) {
        const url = urls[path];
        for (const w of waiters) {
          if (url) w.resolve(url);
          else w.reject(new Error('media_unavailable'));
        }
      }
    } catch (error) {
      for (const waiters of batch.values()) for (const w of waiters) w.reject(error);
    }
  };

  return (path: string): Promise<string> => {
    const hit = cachedSignedUrl(bucket, path);
    if (hit) return Promise.resolve(hit);
    return new Promise((resolve, reject) => {
      const list = pending.get(path) ?? [];
      list.push({ resolve, reject });
      pending.set(path, list);
      if (!timer) timer = setTimeout(() => void flush(), windowMs);
    });
  };
}

/** Avatars live in a public bucket by design. */
export function avatarUrl(client: VyboraClient, path: string | null | undefined): string | null {
  if (!path) return null;
  return client.storage.from('avatars').getPublicUrl(path).data.publicUrl;
}

import { detectMime } from '@vybora/core';
import { validateMediaFile, type MediaPurpose } from '@vybora/validation';
import * as ImagePicker from 'expo-image-picker';

export interface PickedMedia {
  uri: string;
  body: ArrayBuffer;
  mime: string;
  mediaType: 'image' | 'video';
  width: number | null;
  height: number | null;
  durationMs: number | null;
}

export class PermissionDeniedError extends Error {
  constructor() {
    super('Photo library access is off. Enable it in Settings to choose photos and videos.');
  }
}

/**
 * Pick media with the native picker, then verify the real type from file
 * signature bytes and enforce size limits before anything is uploaded.
 * Returns [] if the user cancels.
 */
export async function pickMedia(
  purpose: MediaPurpose,
  opts: { multiple?: boolean; limit?: number } = {},
): Promise<PickedMedia[]> {
  const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) throw new PermissionDeniedError();

  const allowVideo = purpose === 'post' || purpose === 'story' || purpose === 'reel';
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: purpose === 'reel' ? ['videos'] : allowVideo ? ['images', 'videos'] : ['images'],
    allowsMultipleSelection: !!opts.multiple,
    selectionLimit: opts.limit ?? 1,
    quality: 0.85,
    videoMaxDuration: purpose === 'story' ? 60 : 180,
    // Converts HEIC/HEVC to JPEG/H.264 on iOS so every client can display it.
    preferredAssetRepresentationMode:
      ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Compatible,
  });
  if (result.canceled) return [];

  const out: PickedMedia[] = [];
  for (const asset of result.assets) {
    const body = await (await fetch(asset.uri)).arrayBuffer();
    const mime = detectMime(new Uint8Array(body.slice(0, 32)));
    if (!mime) throw new Error(`${asset.fileName ?? 'File'}: unsupported or unrecognized format`);
    const problem = validateMediaFile({ size: body.byteLength, type: mime }, purpose);
    if (problem) throw new Error(problem);
    out.push({
      uri: asset.uri,
      body,
      mime,
      mediaType: mime.startsWith('video/') ? 'video' : 'image',
      width: asset.width || null,
      height: asset.height || null,
      durationMs: asset.duration ? Math.round(asset.duration) : null,
    });
  }
  return out;
}

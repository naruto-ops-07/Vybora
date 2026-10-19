import { Icon } from '@/components/Icon';
import { b64, type AttachmentRef } from '@vybora/e2ee';
import { formatDuration } from '@vybora/core';
import { useQuery } from '@tanstack/react-query';
import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { File } from 'expo-file-system';
import { Image } from 'expo-image';
import * as Sharing from 'expo-sharing';
import { useVideoPlayer, VideoView } from 'expo-video';
import { ActivityIndicator, Alert, Pressable, View } from 'react-native';
import { Text } from '@/components/Text';
import { tint as tintOf, useTheme } from '@/lib/theme';
import { mediaCacheDir } from '@/lib/connect/storage';
import { useConnect } from '../ConnectProvider';
import { useCc } from './primitives';

const VIDEO_BG = '#000000';

/** Decrypt an attachment once and cache the bytes in memory for this session. */
function useDecrypted(ref: AttachmentRef) {
  const { engine } = useConnect();
  return useQuery({
    queryKey: ['connect', 'attachment', ref.path],
    enabled: !!engine,
    staleTime: Infinity,
    gcTime: 10 * 60_000,
    queryFn: () => engine!.openAttachment(ref),
  });
}

/** Some players need a file: write decrypted bytes to the app's private cache. */
function useDecryptedFile(ref: AttachmentRef, ext: string) {
  const bytes = useDecrypted(ref);
  return useQuery({
    queryKey: ['connect', 'attachment-file', ref.path],
    enabled: !!bytes.data,
    staleTime: Infinity,
    queryFn: () => {
      const file = new File(
        mediaCacheDir(),
        `${ref.sha256.replace(/[^A-Za-z0-9]/g, '').slice(0, 24)}.${ext}`,
      );
      if (!file.exists) {
        file.create();
        file.write(bytes.data!);
      }
      return file.uri;
    },
  });
}

const extFor = (mime: string, fallback: string) =>
  ({
    'video/mp4': 'mp4',
    'video/quicktime': 'mov',
    'audio/mp4': 'm4a',
    'audio/m4a': 'm4a',
    'audio/x-m4a': 'm4a',
    'audio/aac': 'aac',
    'audio/webm': 'webm',
  })[mime] ?? fallback;

export function ImageAttachment({
  attachment,
  onOpen,
}: {
  attachment: AttachmentRef;
  onOpen?: (uri: string) => void;
}) {
  const { radii } = useTheme();
  const cc = useCc();
  const { data, isError } = useDecrypted(attachment);
  const ratio = attachment.width && attachment.height ? attachment.width / attachment.height : 1;
  const uri = data ? `data:${attachment.mime};base64,${b64.encode(data)}` : null;
  return (
    <Pressable
      onPress={() => uri && onOpen?.(uri)}
      accessibilityLabel="Encrypted photo"
      accessibilityHint="Opens full screen"
    >
      <View
        style={{
          width: 230,
          aspectRatio: Math.max(0.6, Math.min(1.8, ratio)),
          borderRadius: radii.md,
          overflow: 'hidden',
          backgroundColor: cc.strong,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {uri ? (
          <Image source={{ uri }} style={{ width: '100%', height: '100%' }} contentFit="cover" />
        ) : isError ? (
          <Icon name="alert-triangle" color={cc.textMuted} size={22} />
        ) : (
          <ActivityIndicator color={cc.accent} />
        )}
      </View>
    </Pressable>
  );
}

export function VideoAttachment({ attachment }: { attachment: AttachmentRef }) {
  const { radii } = useTheme();
  const cc = useCc();
  const file = useDecryptedFile(attachment, extFor(attachment.mime, 'mp4'));
  const player = useVideoPlayer(file.data ?? null, (p) => {
    p.loop = false;
  });
  return (
    <View
      style={{
        width: 240,
        height: 300,
        borderRadius: radii.md,
        overflow: 'hidden',
        // Letterboxing: black in every look, like the photo viewer.
        backgroundColor: VIDEO_BG,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {file.data ? (
        <VideoView
          player={player}
          style={{ width: '100%', height: '100%' }}
          nativeControls
          contentFit="contain"
        />
      ) : (
        <ActivityIndicator color={cc.accent} />
      )}
    </View>
  );
}

export function VoiceAttachment({ attachment, tint }: { attachment: AttachmentRef; tint: string }) {
  const file = useDecryptedFile(attachment, extFor(attachment.mime, 'm4a'));
  const player = useAudioPlayer(file.data ? { uri: file.data } : null);
  const status = useAudioPlayerStatus(player);
  const progress = status.duration ? status.currentTime / status.duration : 0;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, width: 220 }}>
      <Pressable
        onPress={() => {
          if (!file.data) return;
          if (status.playing) player.pause();
          else {
            if (status.didJustFinish || progress >= 0.99) player.seekTo(0);
            player.play();
          }
        }}
        accessibilityRole="button"
        accessibilityLabel={status.playing ? 'Pause voice message' : 'Play voice message'}
        style={{
          width: 38,
          height: 38,
          borderRadius: 19,
          // A wash of the bubble's own text colour: reads on incoming and outgoing alike.
          backgroundColor: tintOf(tint, '2E'),
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {file.data ? (
          <Icon name={status.playing ? 'pause' : 'play'} size={17} color={tint} />
        ) : (
          <ActivityIndicator color={tint} size="small" />
        )}
      </Pressable>
      <View style={{ flex: 1, gap: 6 }}>
        <View style={{ height: 4, borderRadius: 2, backgroundColor: tintOf(tint, '38') }}>
          <View
            style={{
              height: 4,
              borderRadius: 2,
              width: `${progress * 100}%`,
              backgroundColor: tint,
            }}
          />
        </View>
        <Text mono style={{ color: tint, fontSize: 12 }}>
          {formatDuration(
            status.playing ? status.currentTime * 1000 : (attachment.durationMs ?? 0),
          )}
        </Text>
      </View>
    </View>
  );
}

export function FileAttachment({ attachment, tint }: { attachment: AttachmentRef; tint: string }) {
  const file = useDecryptedFile(
    attachment,
    attachment.name?.split('.').pop()?.slice(0, 8) || 'bin',
  );
  const kb = attachment.size / 1024;
  const { radii } = useTheme();
  return (
    <Pressable
      onPress={async () => {
        if (!file.data) return;
        if (await Sharing.isAvailableAsync())
          await Sharing.shareAsync(file.data, {
            mimeType: attachment.mime,
            dialogTitle: attachment.name,
          });
        else Alert.alert('Sharing unavailable', 'This device cannot open files from VYBORA.');
      }}
      accessibilityRole="button"
      accessibilityLabel={`File ${attachment.name ?? ''}`}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 10, width: 230 }}
    >
      <View
        style={{
          width: 40,
          height: 40,
          borderRadius: radii.md,
          backgroundColor: tintOf(tint, '29'),
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {file.data ? (
          <Icon name="file-text" size={18} color={tint} />
        ) : (
          <ActivityIndicator color={tint} size="small" />
        )}
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ color: tint, fontWeight: '600' }} numberOfLines={1}>
          {attachment.name ?? 'File'}
        </Text>
        <Text style={{ color: tint, fontSize: 12 }}>
          {kb > 1024 ? `${(kb / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(kb))} KB`} · tap
          to open
        </Text>
      </View>
    </Pressable>
  );
}

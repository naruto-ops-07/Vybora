import type { MediaItem } from '@vybora/types';
import { useEvent } from 'expo';
import { Image } from 'expo-image';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useEffect, useState } from 'react';
import { FlatList, Pressable, View, useWindowDimensions } from 'react-native';
import { useSignedUrl } from '@/hooks/useSignedUrl';
import { useTheme } from '@/lib/theme';
import { Icon, Text } from './ui';

export function SignedImage({ path, alt, style }: { path: string; alt: string; style?: object }) {
  const t = useTheme();
  const { data: uri, isError } = useSignedUrl(path);
  if (isError)
    return (
      <View
        style={[
          {
            flex: 1,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: t.surfaceMuted,
          },
          style,
        ]}
      >
        <Text variant="small">Media unavailable</Text>
      </View>
    );
  return (
    <Image
      source={uri ? { uri } : undefined}
      style={[{ flex: 1, backgroundColor: t.surfaceMuted }, style]}
      contentFit="cover"
      transition={200}
      accessibilityLabel={alt}
      recyclingKey={path}
    />
  );
}

/** A video that only plays while `active`; the player is released on unmount. */
export function SignedVideo({
  path,
  active,
  label,
  loop = true,
  muted = true,
  onEnd,
  onProgress,
  contentFit = 'cover',
}: {
  path: string;
  active: boolean;
  label: string;
  loop?: boolean;
  muted?: boolean;
  onEnd?: () => void;
  onProgress?: (fraction: number) => void;
  contentFit?: 'cover' | 'contain';
}) {
  const { data: uri } = useSignedUrl(path);
  const player = useVideoPlayer(uri ?? null, (p) => {
    p.loop = loop;
    p.muted = muted;
    p.timeUpdateEventInterval = 0.25;
  });
  const { isPlaying } = useEvent(player, 'playingChange', { isPlaying: player.playing });

  useEffect(() => {
    player.muted = muted;
  }, [player, muted]);

  useEffect(() => {
    if (!uri) return;
    if (active) player.play();
    else player.pause();
  }, [active, uri, player]);

  useEffect(() => {
    const subs = [
      player.addListener('playToEnd', () => onEnd?.()),
      player.addListener('timeUpdate', (e) =>
        onProgress?.(player.duration ? e.currentTime / player.duration : 0),
      ),
    ];
    return () => subs.forEach((s) => s.remove());
  }, [player, onEnd, onProgress]);

  return (
    <Pressable
      style={{ flex: 1 }}
      onPress={() => (player.playing ? player.pause() : player.play())}
      accessibilityLabel={label}
      accessibilityHint="Double tap to play or pause"
    >
      <VideoView
        player={player}
        style={{ flex: 1 }}
        contentFit={contentFit}
        nativeControls={false}
      />
      {active && !isPlaying && (
        <View
          pointerEvents="none"
          style={{ position: 'absolute', inset: 0, alignItems: 'center', justifyContent: 'center' }}
        >
          <View style={{ backgroundColor: 'rgba(0,0,0,0.45)', borderRadius: 40, padding: 18 }}>
            <Icon name="play" size={30} color="#fff" />
          </View>
        </View>
      )}
    </Pressable>
  );
}

/** Horizontal paging carousel for post media. */
export function MediaPager({
  media,
  aspect,
  label,
  visible = true,
}: {
  media: MediaItem[];
  aspect: number;
  label: string;
  visible?: boolean;
}) {
  const { width } = useWindowDimensions();
  const [index, setIndex] = useState(0);
  const t = useTheme();
  const height = width / aspect;
  return (
    <View style={{ width, height, backgroundColor: t.surfaceMuted }}>
      <FlatList
        data={media}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        keyExtractor={(m) => m.id}
        onMomentumScrollEnd={(e) => setIndex(Math.round(e.nativeEvent.contentOffset.x / width))}
        renderItem={({ item, index: i }) => (
          <View
            style={{ width, height }}
            accessibilityLabel={`${label}, item ${i + 1} of ${media.length}`}
          >
            {item.media_type === 'video' ? (
              <SignedVideo
                path={item.storage_path}
                active={visible && i === index}
                label={item.alt_text || label}
              />
            ) : (
              <SignedImage path={item.storage_path} alt={item.alt_text || label} />
            )}
          </View>
        )}
      />
      {media.length > 1 && (
        <View
          style={{
            position: 'absolute',
            bottom: 10,
            left: 0,
            right: 0,
            flexDirection: 'row',
            justifyContent: 'center',
            gap: 5,
          }}
          pointerEvents="none"
        >
          {media.map((m, i) => (
            <View
              key={m.id}
              style={{
                width: i === index ? 14 : 6,
                height: 6,
                borderRadius: 3,
                backgroundColor: i === index ? '#fff' : 'rgba(255,255,255,0.55)',
              }}
            />
          ))}
        </View>
      )}
    </View>
  );
}

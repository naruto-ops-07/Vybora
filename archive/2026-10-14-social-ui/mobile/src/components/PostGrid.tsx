import type { PostCard } from '@vybora/types';
import { router } from 'expo-router';
import { Pressable, View, useWindowDimensions } from 'react-native';
import { SignedImage } from './Media';
import { Icon } from './ui';
import { useTheme } from '@/lib/theme';

export function PostTile({ post }: { post: PostCard }) {
  const { width } = useWindowDimensions();
  const t = useTheme();
  const size = (width - 4) / 3;
  const cover = post.media[0];
  return (
    <Pressable
      onPress={() => router.push({ pathname: '/p/[id]', params: { id: post.id } })}
      accessibilityRole="link"
      accessibilityLabel={
        post.caption ? `Post: ${post.caption.slice(0, 60)}` : `Post by ${post.author.username}`
      }
      style={{ width: size, height: size * 1.25, margin: 0.66, backgroundColor: t.surfaceMuted }}
    >
      {cover?.media_type === 'image' && (
        <SignedImage path={cover.storage_path} alt={cover.alt_text || 'Post'} />
      )}
      {cover?.media_type === 'video' && (
        <View
          style={{
            flex: 1,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: '#1B1A22',
          }}
        >
          <Icon name="play" color="#fff" />
        </View>
      )}
      {(post.kind === 'reel' || post.media.length > 1) && (
        <View style={{ position: 'absolute', top: 6, right: 6 }}>
          <Icon name={post.kind === 'reel' ? 'film' : 'copy'} size={16} color="#fff" />
        </View>
      )}
    </Pressable>
  );
}

import type { Friend } from '@vybora/api';
import { useEffect } from 'react';
import { View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { Avatar } from '@/components/Avatar';
import { Text } from '@/components/Text';
import { Button, IconButton } from '@/components/ui';
import { cardStyle, useCc } from '@/features/connect/ui/primitives';
import { useTheme } from '@/lib/theme';
import { nameOf } from './hooks';

export type JoinedPerson = Pick<Friend, 'userId' | 'username' | 'displayName' | 'avatarPath'>;

const SIZE = 40;
/** How far the two avatars overlap once joined; they start 16 px further apart. */
const OVERLAP = 12;
/** Theirs covers the right of mine, so mine shows one initial moved left (same as web). */
const MINE_GLYPH = { x: 0.38, y: 0.5 };
const JOIN_MS = 280;
const SLIDE = 14;

/** The sentence the card shows (and the one a screen reader hears). */
export const joinedText = (friend: JoinedPerson) => `You and ${nameOf(friend)} are now friends`;

/**
 * "Friendship joined" (mobile twin of the web card): my avatar and theirs slide
 * together into an overlap once, 280 ms ease-out; under reduced motion they
 * start joined. `run` restarts the slide for a newer friendship.
 */
export function FriendJoinedCard({
  me,
  friend,
  animate,
  run = 0,
  sayingHi,
  onSayHi,
  onDismiss,
}: {
  me: JoinedPerson;
  friend: JoinedPerson;
  animate: boolean;
  run?: number;
  sayingHi?: boolean;
  onSayHi: () => void;
  onDismiss: () => void;
}) {
  const t = useTheme();
  const cc = useCc();
  const apart = useSharedValue(animate ? 1 : 0);
  useEffect(() => {
    if (!animate) {
      apart.value = 0;
      return;
    }
    apart.value = 1;
    apart.value = withTiming(0, { duration: JOIN_MS, easing: Easing.bezier(0.16, 1, 0.3, 1) });
  }, [animate, run, apart]);
  const mine = useAnimatedStyle(() => ({ transform: [{ translateX: -SLIDE * apart.value }] }));
  const theirs = useAnimatedStyle(() => ({ transform: [{ translateX: SLIDE * apart.value }] }));
  const text = joinedText(friend);

  return (
    <View
      style={{
        marginHorizontal: 16,
        marginTop: 12,
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: 12,
        padding: 16,
        ...cardStyle(t),
      }}
      testID={`friend-joined-${friend.userId}`}
    >
      <View
        style={{ width: SIZE * 2 - OVERLAP, height: SIZE }}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        <Animated.View style={[{ position: 'absolute', left: 0, top: 0 }, mine]}>
          <Avatar
            path={me.avatarPath}
            name={me.username}
            userId={me.userId}
            displayName={me.displayName}
            username={me.username}
            size={SIZE}
            decorative
            glyphAt={MINE_GLYPH}
          />
        </Animated.View>
        {/* Theirs in front, with a ring in the card colour (a border, not a shadow). */}
        <Animated.View
          style={[
            {
              position: 'absolute',
              left: SIZE - OVERLAP - 2,
              top: -2,
              borderRadius: (SIZE + 4) / 2,
              borderWidth: 2,
              borderColor: t.surface,
            },
            theirs,
          ]}
        >
          <Avatar
            path={friend.avatarPath}
            name={friend.username}
            userId={friend.userId}
            displayName={friend.displayName}
            username={friend.username}
            size={SIZE}
            decorative
          />
        </Animated.View>
      </View>
      <View style={{ flex: 1, minWidth: 0, gap: 12 }}>
        <Text
          accessibilityRole="header"
          display
          style={{ color: cc.text, fontSize: 16, fontWeight: '600', lineHeight: 22 }}
        >
          {text}
        </Text>
        <View style={{ alignSelf: 'flex-start' }}>
          <Button
            title="Say hi"
            icon="message-circle"
            compact
            loading={sayingHi}
            accessibilityLabel={`Say hi to ${nameOf(friend)}`}
            onPress={onSayHi}
          />
        </View>
      </View>
      <View style={{ marginTop: -10, marginRight: -10 }}>
        <IconButton name="x" label="Dismiss" size={18} onPress={onDismiss} />
      </View>
    </View>
  );
}

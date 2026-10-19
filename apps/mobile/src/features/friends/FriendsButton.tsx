import { formatUnread, friendRequestsLabel } from '@vybora/core';
import { Pressable, View } from 'react-native';
import { Icon } from '@/components/Icon';
import { CountPill, useCc } from '@/features/connect/ui/primitives';
import { tint, useTheme } from '@/lib/theme';

/**
 * Inbox header entry for the Friends screen. The incoming request count rides
 * on the icon (decorative); screen readers hear it as part of the button name.
 */
export function FriendsButton({ count, onPress }: { count: number; onPress: () => void }) {
  const { radii } = useTheme();
  const cc = useCc();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={count > 0 ? `Friends, ${friendRequestsLabel(count)}` : 'Friends'}
      hitSlop={6}
      style={({ pressed }) => ({
        width: 44,
        height: 44,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: radii.md,
        backgroundColor: pressed ? tint(cc.text, '1A') : 'transparent',
      })}
    >
      <Icon name="users" size={22} color={cc.text} />
      {count > 0 && (
        <View
          importantForAccessibility="no-hide-descendants"
          accessibilityElementsHidden
          style={{ position: 'absolute', top: 2, right: 0 }}
        >
          <CountPill label={formatUnread(count)} ring={cc.bar} small />
        </View>
      )}
    </Pressable>
  );
}

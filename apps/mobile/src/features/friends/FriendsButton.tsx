import { formatUnread, friendRequestsLabel } from '@vybora/core';
import { Pressable, View } from 'react-native';
import { Icon } from '@/components/Icon';
import { Text } from '@/components/Text';
import { useCc } from '@/features/connect/ui/primitives';
import { radii } from '@/lib/theme';

/**
 * Inbox header entry for the Friends screen. The incoming request count rides
 * on the icon (decorative); screen readers hear it as part of the button name.
 */
export function FriendsButton({ count, onPress }: { count: number; onPress: () => void }) {
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
        backgroundColor: pressed ? cc.raised : 'transparent',
      })}
    >
      <Icon name="users" size={22} color={cc.text} />
      {count > 0 && (
        <View
          importantForAccessibility="no-hide-descendants"
          accessibilityElementsHidden
          style={{
            position: 'absolute',
            top: 2,
            right: 0,
            minWidth: 18,
            height: 18,
            paddingHorizontal: 4,
            borderRadius: radii.sm,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: cc.accent,
            borderWidth: 1,
            borderColor: cc.panel,
          }}
        >
          <Text mono style={{ color: cc.onAccent, fontSize: 10, fontWeight: '500' }}>
            {formatUnread(count)}
          </Text>
        </View>
      )}
    </Pressable>
  );
}

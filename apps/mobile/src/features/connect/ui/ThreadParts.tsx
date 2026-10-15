import { formatUnread } from '@vybora/core';
import { Pressable, View } from 'react-native';
import { Icon } from '@/components/Icon';
import { Text } from '@/components/Text';
import { radii } from '@/lib/theme';
import { useCc } from './primitives';

export function DateChip({ label, floating }: { label: string; floating?: boolean }) {
  const cc = useCc();
  return (
    <View style={{ alignItems: 'center', marginVertical: floating ? 0 : 10 }} pointerEvents="none">
      <Text
        mono
        accessibilityRole="header"
        style={{
          color: cc.textMuted,
          fontSize: 11,
          fontWeight: '500',
          paddingHorizontal: 8,
          paddingVertical: 2,
          borderRadius: radii.sm,
          borderWidth: 1,
          borderColor: cc.line,
          backgroundColor: cc.panel,
          overflow: 'hidden',
        }}
      >
        {label}
      </Text>
    </View>
  );
}

export function UnreadDivider({ count }: { count: number }) {
  const cc = useCc();
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        marginVertical: 10,
        paddingHorizontal: 12,
      }}
    >
      <View style={{ flex: 1, height: 1, backgroundColor: cc.accent }} />
      <Text
        mono
        accessibilityRole="header"
        style={{ color: cc.accent, fontSize: 11, fontWeight: '500' }}
      >
        {count === 1 ? '1 unread message' : `${count} unread messages`}
      </Text>
      <View style={{ flex: 1, height: 1, backgroundColor: cc.accent }} />
    </View>
  );
}

export function JumpToLatest({ count, onPress }: { count: number; onPress: () => void }) {
  const cc = useCc();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={count ? `Jump to latest message, ${count} new` : 'Jump to latest message'}
      style={{
        position: 'absolute',
        right: 12,
        bottom: 12,
        width: 44,
        height: 44,
        borderRadius: radii.md,
        borderWidth: 1,
        borderColor: cc.lineStrong,
        backgroundColor: cc.panel,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Icon name="arrow-down" size={18} color={cc.text} />
      {count > 0 && (
        <View
          style={{
            position: 'absolute',
            top: -8,
            right: -8,
            minWidth: 20,
            height: 20,
            borderRadius: radii.sm,
            paddingHorizontal: 4,
            backgroundColor: cc.accent,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Text mono style={{ color: cc.onAccent, fontSize: 11, fontWeight: '500' }}>
            {formatUnread(count)}
          </Text>
        </View>
      )}
    </Pressable>
  );
}

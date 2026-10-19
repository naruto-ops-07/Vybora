import { formatUnread } from '@vybora/core';
import { Pressable, StyleSheet, View } from 'react-native';
import { Icon } from '@/components/Icon';
import { Text } from '@/components/Text';
import { shadowStyle, useTheme } from '@/lib/theme';
import { CountPill, useCc } from './primitives';

/** The day over a run of messages: a floating pill (web `.vy-float`). */
export function DateChip({ label, floating }: { label: string; floating?: boolean }) {
  const t = useTheme();
  const cc = useCc();
  return (
    <View style={{ alignItems: 'center', marginVertical: floating ? 0 : 10 }} pointerEvents="none">
      <View
        style={[
          {
            paddingHorizontal: 12,
            paddingVertical: 4,
            borderRadius: 999,
            borderWidth: StyleSheet.hairlineWidth,
            borderColor: t.highContrast ? cc.lineStrong : cc.line,
            backgroundColor: cc.popover,
          },
          shadowStyle(floating ? 2 : 1, t),
        ]}
      >
        <Text
          mono
          accessibilityRole="header"
          style={{ color: cc.textMuted, fontSize: 11, fontWeight: '500' }}
        >
          {label}
        </Text>
      </View>
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
      <View style={{ flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: cc.accent }} />
      <View
        style={{
          paddingHorizontal: 10,
          paddingVertical: 3,
          borderRadius: 999,
          backgroundColor: cc.accentSoft,
        }}
      >
        <Text
          mono
          accessibilityRole="header"
          style={{ color: cc.accent, fontSize: 11, fontWeight: '600' }}
        >
          {count === 1 ? '1 unread message' : `${count} unread messages`}
        </Text>
      </View>
      <View style={{ flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: cc.accent }} />
    </View>
  );
}

export function JumpToLatest({ count, onPress }: { count: number; onPress: () => void }) {
  const t = useTheme();
  const cc = useCc();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={count ? `Jump to latest message, ${count} new` : 'Jump to latest message'}
      style={({ pressed }) => [
        {
          position: 'absolute',
          right: 12,
          bottom: 12,
          width: 44,
          height: 44,
          borderRadius: 22,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: cc.lineStrong,
          backgroundColor: pressed ? cc.raised : cc.popover,
          alignItems: 'center',
          justifyContent: 'center',
        },
        shadowStyle(2, t),
      ]}
    >
      <Icon name="arrow-down" size={18} color={cc.text} />
      {count > 0 && (
        <View style={{ position: 'absolute', top: -8, right: -8 }}>
          <CountPill label={formatUnread(count)} ring={cc.night} />
        </View>
      )}
    </Pressable>
  );
}

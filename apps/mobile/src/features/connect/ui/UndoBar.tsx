import { useEffect, useRef } from 'react';
import { AccessibilityInfo, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text } from '@/components/Text';
import { shadowStyle, useTheme } from '@/lib/theme';
import { useCc } from './primitives';

/** "Archived · Undo" bar above the bottom edge; disappears after 5 seconds. */
export function UndoBar({
  message,
  onUndo,
  onDone,
}: {
  message: string;
  onUndo: () => void;
  onDone: () => void;
}) {
  const t = useTheme();
  const cc = useCc();
  const insets = useSafeAreaInsets();
  // Keep the latest callback without restarting the 5 s timer on re-render.
  const done = useRef(onDone);
  done.current = onDone;
  useEffect(() => {
    const t = setTimeout(() => done.current(), 5000);
    return () => clearTimeout(t);
  }, [message]);
  // iOS ignores accessibilityLiveRegion, so announce explicitly.
  useEffect(() => {
    AccessibilityInfo.announceForAccessibility(message);
  }, [message]);
  return (
    <View
      testID="undo-bar"
      accessibilityLiveRegion="polite"
      // A toast: the popover surface at elevation 2 (flat, with a strong edge, under HC).
      style={[
        {
          position: 'absolute',
          left: 16,
          right: 16,
          bottom: insets.bottom + 16,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 12,
          paddingLeft: 16,
          borderRadius: t.radii.lg,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: t.highContrast ? cc.lineStrong : cc.line,
          backgroundColor: cc.popover,
        },
        shadowStyle(2, t),
      ]}
    >
      <Text style={{ color: cc.text, flex: 1, fontSize: 14 }}>{message}</Text>
      <Pressable
        onPress={onUndo}
        accessibilityRole="button"
        style={{ minHeight: 44, paddingHorizontal: 16, justifyContent: 'center' }}
      >
        <Text style={{ color: cc.accent, fontWeight: '600' }}>Undo</Text>
      </Pressable>
    </View>
  );
}

import { StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button, GradientFill, Icon, Text } from '@/components/ui';
import { shadowStyle, useTheme } from '@/lib/theme';

/**
 * The app lock screen in the active look: the look's ambient glow behind a lock tile
 * drawn with the primary gradient. High contrast: flat page, flat accent tile, no glow
 * or shadow. Nothing animates, so reduced motion needs no special case. Without
 * `onUnlock` it is the app-switcher cover (no button: the OS snapshot shows only this).
 */
export function LockScreen({
  onUnlock,
  busy,
  testID = 'lock-screen',
}: {
  onUnlock?: () => void;
  busy?: boolean;
  testID?: string;
}) {
  const t = useTheme();
  return (
    <View
      testID={testID}
      accessibilityViewIsModal
      style={[StyleSheet.absoluteFill, { backgroundColor: t.bg }]}
    >
      {!t.highContrast && (
        <View
          testID="lock-glow"
          pointerEvents="none"
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={{
            position: 'absolute',
            top: '18%',
            alignSelf: 'center',
            width: 320,
            height: 320,
            borderRadius: 160,
            backgroundColor: t.glow1,
            opacity: 0.9,
          }}
        />
      )}
      <SafeAreaView
        style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 28, gap: 18 }}
      >
        <View
          testID="lock-tile"
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={[
            {
              width: 76,
              height: 76,
              borderRadius: t.radii.lg,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: t.highContrast ? t.accent : t.primaryTo,
              borderWidth: t.highContrast ? 2 : 0,
              borderColor: t.text,
            },
            shadowStyle(2, t),
          ]}
        >
          {!t.highContrast && (
            <GradientFill
              from={t.primaryFrom}
              to={t.primaryTo}
              radius={t.radii.lg}
              angle={t.gradientAngle}
            />
          )}
          <Icon name="lock" size={34} color={t.highContrast ? t.onAccent : t.onPrimary} />
        </View>
        <Text variant="title" accessibilityRole="header" style={{ textAlign: 'center' }}>
          Messages are locked
        </Text>
        <Text variant="muted" style={{ textAlign: 'center', maxWidth: 300 }}>
          {onUnlock
            ? 'Unlock with Face ID, fingerprint or your device passcode.'
            : 'Your chats are hidden while VYBORA is in the background.'}
        </Text>
        {onUnlock && (
          <Button
            title="Unlock"
            icon="unlock"
            onPress={onUnlock}
            loading={busy}
            accessibilityLabel="Unlock Messages"
            style={{ minHeight: 48, minWidth: 200, marginTop: 6 }}
          />
        )}
      </SafeAreaView>
    </View>
  );
}

import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Path, Rect } from 'react-native-svg';
import { Icon } from '@/components/Icon';
import { Text } from '@/components/ui';
import { radii, useTheme } from '@/lib/theme';

/** VYBORA mark (same geometry as the web logo): flat, two colours. */
export function LogoMark({ size = 32 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 64 64" accessibilityElementsHidden>
      <Rect width={64} height={64} rx={12} fill="#0F4C47" />
      <Path
        d="M18 20 L32 45 L46 20"
        fill="none"
        stroke="#2DD4BF"
        strokeWidth={6}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Rect x={29} y={14} width={6} height={6} fill="#E6EEEE" />
    </Svg>
  );
}

export function AuthScreen({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const t = useTheme();
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: t.bg }}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={{ padding: 24, paddingTop: 32, gap: 28, flexGrow: 1 }}
          keyboardShouldPersistTaps="handled"
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <LogoMark size={28} />
            <Text style={{ fontSize: 16, fontWeight: '700', letterSpacing: 2.2 }}>VYBORA</Text>
          </View>
          <View style={{ gap: 6 }}>
            <Text variant="title" accessibilityRole="header">
              {title}
            </Text>
            {subtitle && <Text variant="muted">{subtitle}</Text>}
          </View>
          <View style={{ gap: 16 }}>{children}</View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Icon name="lock" size={14} color={t.accent} />
            <Text variant="mono" style={{ flex: 1 }}>
              End-to-end encrypted · keys stay on your devices
            </Text>
          </View>
          {footer && (
            <View
              style={{
                alignItems: 'center',
                marginTop: 'auto',
                paddingVertical: 16,
                borderTopWidth: 1,
                borderTopColor: t.border,
              }}
            >
              {footer}
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

export function FormError({ message }: { message: string | null }) {
  const t = useTheme();
  if (!message) return null;
  return (
    <View
      accessibilityRole="alert"
      style={{
        borderWidth: 1,
        borderColor: t.danger,
        borderRadius: radii.md,
        padding: 12,
      }}
    >
      <Text style={{ color: t.danger, fontWeight: '500' }}>{message}</Text>
    </View>
  );
}

import type { ReactNode } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Path, Rect } from 'react-native-svg';
import { Icon } from '@/components/Icon';
import { WelcomeIllustration } from '@/components/illustrations';
import { Text as BaseText } from '@/components/Text';
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
  /** Plain text, or text with a `<Strong>` part (an email address). */
  subtitle?: ReactNode;
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
          <WelcomeIllustration width={176} />
          <View style={{ gap: 6 }}>
            <Text variant="title" accessibilityRole="header">
              {title}
            </Text>
            {subtitle && <Text variant="muted">{subtitle}</Text>}
          </View>
          <View style={{ gap: 16 }}>{children}</View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Icon name="lock" size={14} color={t.accent} />
            <Text variant="small" style={{ flex: 1, color: t.textMuted }}>
              End-to-end encrypted. Your keys stay on your devices.
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

/** The part of a sentence to read first, such as the email a code went to. */
export function Strong({ children }: { children: ReactNode }) {
  const t = useTheme();
  return <BaseText style={{ color: t.text, fontFamily: t.fonts.semibold }}>{children}</BaseText>;
}

/**
 * A quiet text action under a form ("Use a different email"). At least 44 px
 * tall; when disabled it stays legible in a quieter colour instead of fading.
 */
export function AuthTextButton({
  label,
  children,
  onPress,
  disabled,
  busy,
  tone = 'accent',
}: {
  /** What a screen reader says; also the visible text unless `children` is given. */
  label: string;
  children?: ReactNode;
  onPress: () => void;
  disabled?: boolean;
  busy?: boolean;
  tone?: 'accent' | 'muted';
}) {
  const t = useTheme();
  const color = disabled ? t.textSubtle : tone === 'muted' ? t.textMuted : t.accent;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled, busy: !!busy }}
      disabled={disabled}
      onPress={onPress}
      hitSlop={4}
      style={({ pressed }) => ({
        minHeight: 44,
        paddingHorizontal: 12,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        opacity: pressed ? 0.7 : 1,
      })}
    >
      {busy && <ActivityIndicator size="small" color={t.accent} />}
      <BaseText style={{ color, fontFamily: t.fonts.semibold, fontSize: 15, textAlign: 'center' }}>
        {children ?? label}
      </BaseText>
    </Pressable>
  );
}

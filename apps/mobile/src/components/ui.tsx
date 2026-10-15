import { avatarUrl } from '@vybora/api';
import { friendlyError } from '@vybora/core';
import { Image } from 'expo-image';
import { forwardRef, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  type TextInput as RNTextInput,
  View,
  type PressableProps,
  type StyleProp,
  type TextInputProps,
  type TextProps,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { radii, useTheme } from '@/lib/theme';
import { supabase } from '@/lib/supabase';
import { Icon, type IconName } from './Icon';
import { Text as BaseText, TextInput } from './Text';

export { Icon, type IconName };

type Variant = 'title' | 'heading' | 'body' | 'muted' | 'small' | 'label' | 'mono';

export function Text({ variant = 'body', style, ...rest }: TextProps & { variant?: Variant }) {
  const t = useTheme();
  const styles: Record<Variant, TextStyle> = {
    title: { fontSize: 26, fontWeight: '700', letterSpacing: -0.4, color: t.text },
    heading: { fontSize: 18, fontWeight: '600', color: t.text },
    body: { fontSize: 15, lineHeight: 22, color: t.text },
    muted: { fontSize: 14, lineHeight: 20, color: t.textMuted },
    small: { fontSize: 12, lineHeight: 17, color: t.textMuted },
    label: { fontSize: 13, fontWeight: '600', color: t.text },
    mono: { fontSize: 11, lineHeight: 16, color: t.textSubtle },
  };
  return <BaseText mono={variant === 'mono'} style={[styles[variant], style]} {...rest} />;
}

export function Button({
  title,
  onPress,
  variant = 'primary',
  loading,
  disabled,
  icon,
  style,
  accessibilityLabel,
  compact,
}: {
  title: string;
  onPress?: PressableProps['onPress'];
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost' | 'outline';
  loading?: boolean;
  disabled?: boolean;
  icon?: IconName;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
  compact?: boolean;
}) {
  const t = useTheme();
  const bg = {
    primary: t.accent,
    secondary: t.surfaceMuted,
    danger: t.danger,
    ghost: 'transparent',
    outline: 'transparent',
  }[variant];
  const fg = {
    primary: t.onAccent,
    secondary: t.text,
    danger: '#FFFFFF',
    ghost: t.accent,
    outline: t.text,
  }[variant];
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? title}
      accessibilityState={{ disabled: disabled || loading, busy: loading }}
      disabled={disabled || loading}
      onPress={onPress}
      style={({ pressed }) => [
        {
          minHeight: compact ? 36 : 48,
          paddingHorizontal: compact ? 14 : 20,
          borderRadius: radii.md,
          backgroundColor: bg,
          borderWidth: variant === 'outline' ? 1 : 0,
          borderColor: t.borderStrong,
          alignItems: 'center',
          justifyContent: 'center',
          flexDirection: 'row',
          gap: 8,
          // Colour-only press feedback: no scaling or lifting.
          opacity: disabled ? 0.45 : pressed ? 0.8 : 1,
        },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={fg} />
      ) : icon ? (
        <Icon name={icon} size={16} color={fg} />
      ) : null}
      <BaseText style={{ color: fg, fontWeight: '600', fontSize: compact ? 13 : 15 }}>
        {title}
      </BaseText>
    </Pressable>
  );
}

export const TextField = forwardRef<
  RNTextInput,
  TextInputProps & { label: string; error?: string; hint?: string }
>(function TextField({ label, error, hint, style, ...rest }, ref) {
  const t = useTheme();
  return (
    <View style={{ gap: 6 }}>
      <Text variant="label">{label}</Text>
      <TextInput
        ref={ref}
        accessibilityLabel={label}
        placeholderTextColor={t.textSubtle}
        style={[
          {
            minHeight: 48,
            borderWidth: 1,
            borderColor: error ? t.danger : t.borderStrong,
            borderRadius: radii.md,
            paddingHorizontal: 14,
            paddingVertical: 12,
            fontSize: 16,
            color: t.text,
            backgroundColor: t.surface,
          },
          style,
        ]}
        {...rest}
      />
      {error ? (
        <Text variant="small" style={{ color: t.danger }} accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : hint ? (
        <Text variant="small">{hint}</Text>
      ) : null}
    </View>
  );
});

// Flat tones; white initials meet 4.5:1 on each.
const AVATAR_COLORS = ['#0F766E', '#1D4ED8', '#047857', '#6D28D9', '#B45309', '#3F4A4D', '#BE185D'];

export function Avatar({
  path,
  name,
  size = 40,
}: {
  path: string | null | undefined;
  name: string;
  size?: number;
}) {
  const uri = avatarUrl(supabase, path);
  const color =
    AVATAR_COLORS[
      Math.abs([...name].reduce((h, c) => (h * 31 + c.charCodeAt(0)) | 0, 0)) % AVATAR_COLORS.length
    ];
  return (
    <View accessibilityLabel={name}>
      {uri ? (
        <Image
          source={{ uri }}
          style={{ width: size, height: size, borderRadius: size / 2 }}
          contentFit="cover"
          transition={120}
          accessibilityIgnoresInvertColors
        />
      ) : (
        <View
          style={{
            width: size,
            height: size,
            borderRadius: size / 2,
            backgroundColor: color,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <BaseText style={{ color: '#fff', fontWeight: '600', fontSize: size * 0.4 }}>
            {(name[0] ?? '?').toUpperCase()}
          </BaseText>
        </View>
      )}
    </View>
  );
}

export function Loading({ label = 'Loading' }: { label?: string }) {
  const t = useTheme();
  return (
    <View
      style={{
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        padding: 32,
        backgroundColor: t.bg,
      }}
      accessibilityLabel={label}
    >
      <ActivityIndicator color={t.accent} />
    </View>
  );
}

export function Empty({
  icon,
  title,
  body,
  action,
}: {
  icon?: IconName;
  title: string;
  body?: string;
  action?: ReactNode;
}) {
  const t = useTheme();
  return (
    <View style={{ alignItems: 'center', padding: 40, gap: 8 }}>
      {icon && (
        <View
          style={{
            width: 48,
            height: 48,
            borderRadius: radii.lg,
            borderWidth: 1,
            borderColor: t.border,
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: 8,
          }}
        >
          <Icon name={icon} size={22} color={t.accent} />
        </View>
      )}
      <Text variant="heading" style={{ textAlign: 'center' }}>
        {title}
      </Text>
      {body && (
        <Text variant="muted" style={{ textAlign: 'center' }}>
          {body}
        </Text>
      )}
      {action && <View style={{ marginTop: 12 }}>{action}</View>}
    </View>
  );
}

export function ErrorView({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  return (
    <View style={{ alignItems: 'center', padding: 32, gap: 10 }} accessibilityRole="alert">
      <Text variant="heading">Something went wrong</Text>
      <Text variant="muted" style={{ textAlign: 'center' }}>
        {friendlyError(error, 'We couldn’t load this right now.')}
      </Text>
      {onRetry && (
        <Button title="Try again" variant="outline" icon="rotate-cw" onPress={onRetry} compact />
      )}
    </View>
  );
}

export function IconButton({
  name,
  onPress,
  label,
  color,
  size = 22,
  active,
}: {
  name: IconName;
  onPress?: () => void;
  label: string;
  color?: string;
  size?: number;
  active?: boolean;
}) {
  const t = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={active !== undefined ? { selected: active } : undefined}
      hitSlop={6}
      style={({ pressed }) => ({
        width: 44,
        height: 44,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: radii.md,
        backgroundColor: pressed ? t.surfaceMuted : 'transparent',
      })}
    >
      <Icon name={name} size={size} color={color ?? t.text} />
    </Pressable>
  );
}

export function Divider() {
  const t = useTheme();
  return <View style={{ height: 1, backgroundColor: t.border }} />;
}

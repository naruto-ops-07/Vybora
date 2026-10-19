import { friendlyError } from '@vybora/core';
import { forwardRef, useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  type TextInput as RNTextInput,
  View,
  type PressableProps,
  type StyleProp,
  type TextInputProps,
  type TextProps,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { shadowStyle, tint, useTheme } from '@/lib/theme';
import { GradientFill } from './GradientFill';
import { Icon, type IconName } from './Icon';
import { Text as BaseText, TextInput } from './Text';

export { Icon, type IconName };
export { Avatar, GroupAvatar, type AvatarPerson } from './Avatar';
export { GradientFill } from './GradientFill';

type Variant = 'title' | 'heading' | 'body' | 'muted' | 'small' | 'label' | 'mono';

/** Titles and headings use the look's display face; everything else its text face. */
export function Text({ variant = 'body', style, ...rest }: TextProps & { variant?: Variant }) {
  const t = useTheme();
  const styles: Record<Variant, TextStyle> = {
    title: { fontSize: 26, lineHeight: 32, letterSpacing: -0.3, color: t.text },
    heading: { fontSize: 18, lineHeight: 24, letterSpacing: -0.1, color: t.text },
    body: { fontSize: 15, lineHeight: 22, color: t.text },
    muted: { fontSize: 14, lineHeight: 20, color: t.textMuted },
    small: { fontSize: 12, lineHeight: 17, color: t.textMuted },
    label: { fontSize: 13, fontWeight: '600', color: t.text },
    mono: { fontSize: 11, lineHeight: 16, color: t.textSubtle },
  };
  return (
    <BaseText
      mono={variant === 'mono'}
      display={variant === 'title' || variant === 'heading'}
      style={[styles[variant], style]}
      {...rest}
    />
  );
}

/**
 * The look's buttons. Primary: the primary gradient (Velvet top → bottom with a 1 px
 * inner highlight, the others corner to corner) with soft depth. Pressed fills move
 * away from their text, so contrast only rises; nothing moves or scales. High
 * contrast: a flat accent, no shadow.
 */
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
  const off = !!(disabled || loading);
  const radius = compact ? t.radii.sm + 2 : t.radii.md;
  const gradient = variant === 'primary' && !t.highContrast;
  const raised = variant === 'primary' || variant === 'danger';
  const fg = {
    primary: t.onPrimary,
    secondary: t.text,
    danger: t.onDanger,
    ghost: t.accent,
    outline: t.text,
  }[variant];
  const fill = (pressed: boolean): string => {
    switch (variant) {
      case 'primary':
        return t.highContrast ? (pressed ? t.accentHover : t.accent) : t.primaryTo;
      case 'secondary':
        return pressed ? t.surfaceStrong : t.surfaceMuted;
      case 'danger':
        return pressed ? t.dangerPress : t.danger;
      default:
        return pressed ? tint(t.text, '1C') : 'transparent';
    }
  };
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? title}
      accessibilityState={{ disabled: off, busy: loading }}
      disabled={off}
      onPress={onPress}
      // Compact buttons draw at 36 px; the touch area still reaches 44.
      hitSlop={compact ? 4 : undefined}
      style={({ pressed }) => [
        {
          minHeight: compact ? 36 : 48,
          paddingHorizontal: compact ? 14 : 20,
          borderRadius: radius,
          backgroundColor: fill(pressed && !off),
          borderWidth: variant === 'outline' || variant === 'secondary' ? 1 : 0,
          borderColor: variant === 'outline' ? t.borderStrong : t.border,
          alignItems: 'center',
          justifyContent: 'center',
          flexDirection: 'row',
          gap: 8,
          opacity: disabled ? 0.45 : 1,
        },
        // Resting depth; pressed settles into the page.
        raised && !off && !pressed ? shadowStyle(1, t) : null,
        style,
      ]}
    >
      {({ pressed }) => {
        const down = pressed && !off;
        return (
          <>
            {gradient && (
              <GradientFill
                from={down ? t.primaryPressFrom : t.primaryFrom}
                to={down ? t.primaryPressTo : t.primaryTo}
                angle={t.gradientAngle}
                radius={radius}
              />
            )}
            {gradient && t.look === 'velvet' && !down && (
              <View
                pointerEvents="none"
                style={{
                  position: 'absolute',
                  top: 0,
                  left: radius / 2,
                  right: radius / 2,
                  height: StyleSheet.hairlineWidth * 2,
                  backgroundColor: 'rgba(255,255,255,0.45)',
                }}
              />
            )}
            {loading ? (
              <ActivityIndicator color={fg} />
            ) : icon ? (
              <Icon name={icon} size={16} color={fg} />
            ) : null}
            <BaseText
              style={{
                color: fg,
                fontWeight: '600',
                fontSize: compact ? 13 : 15,
                letterSpacing: 0.1,
              }}
            >
              {title}
            </BaseText>
          </>
        );
      }}
    </Pressable>
  );
}

/**
 * A labelled field: a control edge (border-strong) on the surface. Focused, a 2 px
 * accent edge (danger when invalid); the padding gives back the extra pixel, so
 * nothing shifts.
 */
export const TextField = forwardRef<
  RNTextInput,
  TextInputProps & { label: string; error?: string; hint?: string }
>(function TextField({ label, error, hint, style, onFocus, onBlur, ...rest }, ref) {
  const t = useTheme();
  const [focused, setFocused] = useState(false);
  const edge = focused ? 2 : 1;
  return (
    <View style={{ gap: 6 }}>
      <Text variant="label">{label}</Text>
      <TextInput
        ref={ref}
        accessibilityLabel={label}
        placeholderTextColor={t.textSubtle}
        selectionColor={t.accent}
        cursorColor={t.accent}
        onFocus={(e) => {
          setFocused(true);
          onFocus?.(e);
        }}
        onBlur={(e) => {
          setFocused(false);
          onBlur?.(e);
        }}
        style={[
          {
            minHeight: 48,
            borderWidth: edge,
            borderColor: error ? t.danger : focused ? t.accent : t.borderStrong,
            borderRadius: t.radii.md,
            paddingHorizontal: 15 - edge,
            paddingVertical: 13 - edge,
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

/** The empty-state icon tile: surface → muted, a hairline and soft depth (flat in HC). */
export function IconTile({ name }: { name: IconName }) {
  const t = useTheme();
  return (
    <View
      style={[
        {
          width: 56,
          height: 56,
          borderRadius: t.radii.lg,
          borderWidth: 1,
          borderColor: t.border,
          backgroundColor: t.surface,
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: 8,
        },
        shadowStyle(1, t),
      ]}
    >
      {!t.highContrast && (
        <GradientFill from={t.surface} to={t.surfaceMuted} angle={180} radius={t.radii.lg - 1} />
      )}
      <Icon name={name} size={24} color={t.accent} />
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
  return (
    <View style={{ alignItems: 'center', padding: 40, gap: 8 }}>
      {icon && <IconTile name={icon} />}
      <Text variant="heading" style={{ textAlign: 'center' }}>
        {title}
      </Text>
      {body && (
        <Text variant="muted" style={{ textAlign: 'center', maxWidth: 340 }}>
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
      // Pressed: a tint of the ink, which reads on solid, muted and glass panels alike.
      style={({ pressed }) => ({
        width: 44,
        height: 44,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: t.radii.md,
        backgroundColor: pressed ? tint(t.text, '1A') : active ? t.accentSoft : 'transparent',
      })}
    >
      <Icon name={name} size={size} color={color ?? (active ? t.accent : t.text)} />
    </Pressable>
  );
}

export function Divider() {
  const t = useTheme();
  return <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: t.border }} />;
}

import type { ChatTheme } from '@vybora/api';
import { chatAccent, resolveChatTheme, wallpaperSvg, type ChatThemeDef } from '@vybora/config';
import { useEffect, useMemo, useRef, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Animated,
  Pressable,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { SvgXml } from 'react-native-svg';
import { Icon, type IconName } from '@/components/Icon';
import { Text } from '@/components/Text';
import { radii, useTheme } from '@/lib/theme';

/**
 * Connect palette, derived from the app theme so messaging follows light/dark
 * mode. Keys are semantic (surface roles), not hues.
 */
export function useCc() {
  const t = useTheme();
  return useMemo(
    () => ({
      dark: t.dark,
      night: t.bg,
      panel: t.surface,
      raised: t.surfaceMuted,
      strong: t.surfaceStrong,
      line: t.border,
      lineStrong: t.borderStrong,
      text: t.text,
      textMuted: t.textMuted,
      textSubtle: t.textSubtle,
      accent: t.accent,
      onAccent: t.onAccent,
      accentSoft: t.accentSoft,
      bubbleIn: t.bubbleIn,
      success: t.success,
      danger: t.danger,
      warning: t.warning,
    }),
    [t],
  );
}

export type Cc = ReturnType<typeof useCc>;

/** Effective theme: a personal override wins only if the user enabled it. */
export function effectiveTheme(
  shared: ChatTheme,
  local: ChatTheme | null,
  useLocal: boolean,
): ChatTheme {
  return useLocal && local ? local : shared;
}

export interface ResolvedTheme extends ChatThemeDef {
  accent: string;
  background: string;
  outgoing: string;
  outgoingText: string;
  incoming: string;
  incomingText: string;
}

/** A shared chat theme resolved against the current light/dark mode. */
export function useThemeDef(theme: ChatTheme): ResolvedTheme {
  const cc = useCc();
  return useMemo(() => {
    const def = resolveChatTheme(theme);
    return {
      ...def,
      accent: chatAccent(def, cc.dark),
      background: cc.night,
      outgoing: def.bubble,
      outgoingText: def.bubbleText,
      incoming: cc.bubbleIn,
      incomingText: cc.text,
    };
  }, [theme, cc]);
}

/** Chat background: app background + optional flat wallpaper (identical on every device). */
export function ChatBackground({ theme, children }: { theme: ChatTheme; children: ReactNode }) {
  const def = useThemeDef(theme);
  const svg = useMemo(
    () => wallpaperSvg(theme.wallpaper ?? 'none', def.accent),
    [theme.wallpaper, def.accent],
  );
  return (
    <View style={{ flex: 1, backgroundColor: def.background }}>
      {svg && (
        <View style={StyleSheet.absoluteFill} pointerEvents="none">
          <SvgXml xml={svg} width="100%" height="100%" preserveAspectRatio="xMidYMid slice" />
        </View>
      )}
      {children}
    </View>
  );
}

/** Flat filled surface (kept as a component so callers stay declarative). */
export function Fill({
  color,
  style,
  children,
}: {
  color: string;
  style?: StyleProp<ViewStyle>;
  children?: ReactNode;
}) {
  return <View style={[{ backgroundColor: color }, style]}>{children}</View>;
}

export function EncryptionBadge({ compact }: { compact?: boolean }) {
  const cc = useCc();
  return (
    <View
      style={{ flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'center' }}
      accessibilityLabel="Messages are end-to-end encrypted"
    >
      <Icon name="lock" size={12} color={cc.accent} />
      <Text mono style={{ color: cc.textMuted, fontSize: 11 }}>
        {compact ? 'encrypted' : 'end-to-end encrypted'}
      </Text>
    </View>
  );
}

/** A segment in a rectangular segmented control (not a pill). */
export function Pill({
  label,
  active,
  onPress,
  icon,
}: {
  label: string;
  active?: boolean;
  onPress: () => void;
  icon?: IconName;
}) {
  const cc = useCc();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: !!active }}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingHorizontal: 12,
        minHeight: 36,
        borderRadius: radii.md,
        backgroundColor: active ? cc.accent : pressed ? cc.raised : cc.panel,
        borderWidth: 1,
        borderColor: active ? cc.accent : cc.lineStrong,
      })}
    >
      {icon && <Icon name={icon} size={14} color={active ? cc.onAccent : cc.textMuted} />}
      <Text style={{ color: active ? cc.onAccent : cc.textMuted, fontSize: 13, fontWeight: '500' }}>
        {label}
      </Text>
    </Pressable>
  );
}

export function SectionCard({
  title,
  children,
  footer,
}: {
  title?: string;
  children: ReactNode;
  footer?: string;
}) {
  const cc = useCc();
  return (
    <View style={{ gap: 8 }}>
      {title && (
        <Text
          accessibilityRole="header"
          style={{ color: cc.textMuted, fontSize: 13, fontWeight: '600', paddingHorizontal: 4 }}
        >
          {title}
        </Text>
      )}
      <View
        style={{
          backgroundColor: cc.panel,
          borderRadius: radii.lg,
          borderWidth: 1,
          borderColor: cc.line,
          overflow: 'hidden',
        }}
      >
        {children}
      </View>
      {footer && (
        <Text style={{ color: cc.textMuted, fontSize: 12, lineHeight: 17, paddingHorizontal: 4 }}>
          {footer}
        </Text>
      )}
    </View>
  );
}

export function Row({
  icon,
  label,
  value,
  onPress,
  danger,
  right,
  description,
}: {
  icon?: IconName;
  label: string;
  value?: string;
  onPress?: () => void;
  danger?: boolean;
  right?: ReactNode;
  description?: string;
}) {
  const cc = useCc();
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole={onPress ? 'button' : undefined}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        paddingHorizontal: 16,
        minHeight: 52,
        paddingVertical: 12,
        backgroundColor: pressed ? cc.raised : 'transparent',
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: cc.line,
      })}
    >
      {icon && <Icon name={icon} size={20} color={danger ? cc.danger : cc.textMuted} />}
      <View style={{ flex: 1 }}>
        <Text style={{ color: danger ? cc.danger : cc.text, fontSize: 15, fontWeight: '500' }}>
          {label}
        </Text>
        {description && (
          <Text style={{ color: cc.textMuted, fontSize: 12, lineHeight: 17, marginTop: 2 }}>
            {description}
          </Text>
        )}
      </View>
      {value && (
        <Text style={{ color: cc.textMuted, fontSize: 14, maxWidth: '45%' }} numberOfLines={1}>
          {value}
        </Text>
      )}
      {right ?? (onPress && <Icon name="chevron-right" size={16} color={cc.textSubtle} />)}
    </Pressable>
  );
}

/** Three pulsing dots for "typing…" (opacity only; stays static with reduced motion). */
export function TypingDots({ color }: { color?: string }) {
  const cc = useCc();
  const values = useRef([0, 1, 2].map(() => new Animated.Value(0.3))).current;
  useEffect(() => {
    const loops = values.map((v, i) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(i * 140),
          Animated.timing(v, { toValue: 1, duration: 320, useNativeDriver: true }),
          Animated.timing(v, { toValue: 0.3, duration: 320, useNativeDriver: true }),
        ]),
      ),
    );
    loops.forEach((l) => l.start());
    return () => loops.forEach((l) => l.stop());
  }, [values]);
  return (
    <View
      style={{ flexDirection: 'row', gap: 3, alignItems: 'center' }}
      accessibilityLabel="typing"
    >
      {values.map((v, i) => (
        <Animated.View
          key={i}
          style={{
            width: 4,
            height: 4,
            borderRadius: 2,
            backgroundColor: color ?? cc.accent,
            opacity: v,
          }}
        />
      ))}
    </View>
  );
}

export function ConnectEmpty({
  icon,
  title,
  body,
  action,
}: {
  icon: IconName;
  title: string;
  body?: string;
  action?: ReactNode;
}) {
  const cc = useCc();
  return (
    <View style={{ alignItems: 'center', padding: 36, gap: 8 }}>
      <View
        style={{
          width: 48,
          height: 48,
          borderRadius: radii.lg,
          borderWidth: 1,
          borderColor: cc.line,
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: 8,
        }}
      >
        <Icon name={icon} size={22} color={cc.accent} />
      </View>
      <Text style={{ color: cc.text, fontSize: 17, fontWeight: '600', textAlign: 'center' }}>
        {title}
      </Text>
      {body && (
        <Text style={{ color: cc.textMuted, fontSize: 14, lineHeight: 20, textAlign: 'center' }}>
          {body}
        </Text>
      )}
      {action && <View style={{ marginTop: 12 }}>{action}</View>}
    </View>
  );
}

export function PrimaryButton({
  title,
  onPress,
  icon,
  loading,
  disabled,
  danger,
}: {
  title: string;
  onPress: () => void;
  icon?: IconName;
  loading?: boolean;
  disabled?: boolean;
  danger?: boolean;
}) {
  const cc = useCc();
  const bg = danger ? cc.danger : cc.accent;
  const fg = danger ? '#FFFFFF' : cc.onAccent;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityState={{ disabled: disabled || loading, busy: loading }}
      style={({ pressed }) => ({
        height: 48,
        borderRadius: radii.md,
        backgroundColor: bg,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        paddingHorizontal: 20,
        opacity: disabled ? 0.45 : pressed ? 0.8 : 1,
      })}
    >
      {loading ? (
        <ActivityIndicator color={fg} />
      ) : (
        icon && <Icon name={icon} size={17} color={fg} />
      )}
      <Text style={{ color: fg, fontWeight: '600', fontSize: 15 }}>{title}</Text>
    </Pressable>
  );
}

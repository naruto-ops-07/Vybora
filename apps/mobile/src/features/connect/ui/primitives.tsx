import type { ChatTheme } from '@vybora/api';
import {
  chatAccent,
  isDefaultChatTheme,
  outgoingBubbleFill,
  resolveChatTheme,
  wallpaperSvg,
  type ChatThemeDef,
  type OutgoingBubbleFill,
} from '@vybora/config';
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
import { useA11y } from '@/lib/a11y';
import { GradientFill } from '@/components/GradientFill';
import { shadowStyle, tint, useTheme } from '@/lib/theme';

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
      /** Header / composer surface (the look's glass colour; no blur on mobile). */
      glass: t.panel,
      /**
       * Bars that content scrolls under (headers, composer, tab bars): the look's panel
       * when it is solid, else the surface. Without blur a translucent panel would let
       * the thread read through it.
       */
      bar: t.panel.startsWith('#') ? t.panel : t.surface,
      popover: t.popover,
      /** Behind sheets and dialogs: the ink (or black in dark) at about half strength. */
      scrim: tint(t.dark ? '#000000' : t.text, t.dark ? '99' : '73'),
      look: t.look,
      highContrast: t.highContrast,
      radii: t.radii,
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
  /** The outgoing bubble's flat colour: the fill's end stop (also the tail's fill). */
  outgoing: string;
  outgoingText: string;
  /** What outgoing bubbles are filled with (shared with web: `outgoingBubbleFill`). */
  fill: OutgoingBubbleFill;
  incoming: string;
  incomingText: string;
  /** Accessibility → High contrast: chat colours follow the high-contrast accent. */
  highContrast?: boolean;
}

/**
 * A shared chat theme resolved against the look, mode and contrast in effect. The
 * Default theme is the look's own gradient bubble and accent; a named theme keeps its
 * colour (flat); high contrast is flat in the high-contrast accent.
 */
export function useThemeDef(theme: ChatTheme): ResolvedTheme {
  const t = useTheme();
  const highContrast = t.highContrast;
  return useMemo(() => {
    const def = resolveChatTheme(theme);
    const fill = outgoingBubbleFill(theme, t.look, t.dark ? 'dark' : 'light', { highContrast });
    // In high contrast `t` already carries the high-contrast tokens.
    const accent = highContrast || isDefaultChatTheme(theme) ? t.accent : chatAccent(def, t.dark);
    return {
      ...def,
      accent,
      background: t.bg,
      outgoing: fill.to,
      outgoingText: fill.text,
      fill,
      incoming: t.bubbleIn,
      incomingText: t.text,
      highContrast,
    };
  }, [theme, t, highContrast]);
}

/** Chat background: app background + optional flat wallpaper (identical on every device). */
export function ChatBackground({
  theme,
  glow,
  children,
}: {
  theme: ChatTheme;
  /** The look's light (`ChatGlow`), drawn under the wallpaper. */
  glow?: ReactNode;
  children: ReactNode;
}) {
  const def = useThemeDef(theme);
  // High contrast: plain background, no wallpaper pattern.
  const svg = useMemo(
    () => (def.highContrast ? null : wallpaperSvg(theme.wallpaper ?? 'none', def.accent)),
    [theme.wallpaper, def.accent, def.highContrast],
  );
  return (
    <View style={{ flex: 1, backgroundColor: def.background, overflow: 'hidden' }}>
      {glow}
      {svg && (
        <View testID="chat-wallpaper" style={StyleSheet.absoluteFill} pointerEvents="none">
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
        borderRadius: cc.radii.sm + 2,
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
  const t = useTheme();
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
      {/* Depth on the outer view; the inner one clips rows to the radius. */}
      <View style={[{ borderRadius: t.radii.lg, backgroundColor: cc.panel }, shadowStyle(1, t)]}>
        <View
          style={{
            backgroundColor: cc.panel,
            borderRadius: t.radii.lg,
            borderWidth: StyleSheet.hairlineWidth,
            borderColor: t.highContrast ? cc.lineStrong : cc.line,
            overflow: 'hidden',
          }}
        >
          {children}
        </View>
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
        backgroundColor: pressed ? tint(cc.text, '12') : 'transparent',
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
  const { reduceMotion } = useA11y();
  const values = useRef([0, 1, 2].map(() => new Animated.Value(0.3))).current;
  useEffect(() => {
    if (reduceMotion) {
      values.forEach((v) => v.setValue(0.75));
      return;
    }
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
  }, [values, reduceMotion]);
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
          borderRadius: cc.radii.lg,
          borderWidth: 1,
          borderColor: cc.line,
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: 8,
        }}
      >
        <Icon name={icon} size={22} color={cc.accent} />
      </View>
      <Text
        display
        style={{ color: cc.text, fontSize: 17, fontWeight: '600', textAlign: 'center' }}
      >
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

/** The screen's main action: the look's primary gradient (danger: flat), as `Button`. */
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
  const t = useTheme();
  const off = !!(disabled || loading);
  const gradient = !danger && !t.highContrast;
  const radius = t.radii.md;
  const fg = danger ? t.onDanger : t.onPrimary;
  return (
    <Pressable
      onPress={onPress}
      disabled={off}
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityState={{ disabled: off, busy: loading }}
      style={({ pressed }) => [
        {
          minHeight: 48,
          borderRadius: radius,
          backgroundColor: danger
            ? pressed && !off
              ? t.dangerPress
              : t.danger
            : t.highContrast
              ? pressed && !off
                ? t.accentHover
                : t.accent
              : t.primaryTo,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8,
          paddingHorizontal: 20,
          opacity: disabled ? 0.45 : 1,
        },
        !off && !pressed ? shadowStyle(1, t) : null,
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
            {loading ? (
              <ActivityIndicator color={fg} />
            ) : (
              icon && <Icon name={icon} size={17} color={fg} />
            )}
            <Text style={{ color: fg, fontWeight: '600', fontSize: 15, letterSpacing: 0.1 }}>
              {title}
            </Text>
          </>
        );
      }}
    </Pressable>
  );
}

/**
 * An unread or request count (web `.vy-count`): the primary gradient with on-primary
 * digits; `quiet` (muted chats) is a strong surface. Flat under high contrast.
 */
export function CountPill({
  label,
  quiet,
  ring,
  small,
}: {
  label: string;
  quiet?: boolean;
  /** An edge in the colour behind, so the pill reads where it overlaps an icon. */
  ring?: string;
  small?: boolean;
}) {
  const t = useTheme();
  const h = small ? 18 : 20;
  const gradient = !quiet && !t.highContrast;
  return (
    <View
      style={{
        minWidth: h,
        height: h,
        borderRadius: h / 2,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: small ? 4 : 6,
        backgroundColor: quiet ? t.surfaceStrong : t.highContrast ? t.accent : t.primaryTo,
        borderWidth: ring ? 1.5 : 0,
        borderColor: ring,
        overflow: 'hidden',
      }}
    >
      {gradient && <GradientFill from={t.primaryFrom} to={t.primaryTo} angle={t.gradientAngle} />}
      <Text
        mono
        style={{
          color: quiet ? t.text : t.highContrast ? t.onAccent : t.onPrimary,
          fontSize: small ? 10 : 11,
          fontWeight: '600',
        }}
      >
        {label}
      </Text>
    </View>
  );
}

/** A round 44 px icon button in the primary gradient (New chat, Send). Flat under HC. */
export function PrimaryIconButton({
  icon,
  label,
  onPress,
  disabled,
  size = 40,
  children,
}: {
  icon?: IconName;
  label: string;
  onPress: () => void;
  disabled?: boolean;
  size?: number;
  /** Replaces the icon (the sealed-send glyph). */
  children?: ReactNode;
}) {
  const t = useTheme();
  const gradient = !t.highContrast;
  const pad = Math.max(0, (44 - size) / 2);
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled }}
      hitSlop={pad}
      style={({ pressed }) => [
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: t.highContrast
            ? pressed
              ? t.accentHover
              : t.accent
            : pressed
              ? t.primaryPressTo
              : t.primaryTo,
          opacity: disabled ? 0.45 : 1,
        },
        !disabled && !pressed ? shadowStyle(1, t) : null,
      ]}
    >
      {({ pressed }) => (
        <>
          {gradient && (
            <GradientFill
              from={pressed ? t.primaryPressFrom : t.primaryFrom}
              to={pressed ? t.primaryPressTo : t.primaryTo}
              angle={t.gradientAngle}
              radius={size / 2}
            />
          )}
          {children ??
            (icon && (
              <Icon name={icon} size={18} color={t.highContrast ? t.onAccent : t.onPrimary} />
            ))}
        </>
      )}
    </Pressable>
  );
}

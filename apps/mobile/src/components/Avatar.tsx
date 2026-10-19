import { avatarUrl } from '@vybora/api';
import { initialsFor } from '@vybora/core';
import { Image } from 'expo-image';
import { useState } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { usePersonTone } from '@/lib/personTones';
import { supabase } from '@/lib/supabase';
import { useTheme } from '@/lib/theme';
import { Icon } from './Icon';
import { Text } from './Text';

/** Below this size two letters get too small to read; show one. */
const TWO_INITIALS_MIN = 24;

export interface AvatarProps {
  path: string | null | undefined;
  /** Accessible name (usually the username or the name shown beside it). */
  name: string;
  /** Picks the person's tone for the fallback; stable across devices. */
  userId: string;
  /** Initials come from the display name, else `username`, else `name`. */
  displayName?: string | null;
  username?: string;
  size?: number;
  /** Part of a larger labelled image (a group avatar): no label of its own. */
  decorative?: boolean;
  style?: StyleProp<ViewStyle>;
  /**
   * Where the initials sit, as fractions of `size` (default the centre). For an avatar
   * partly covered by another: one initial, moved into the part that stays visible.
   */
  glyphAt?: { x: number; y: number };
}

/**
 * A person's photo, or a flat circle in their tone with one or two initials
 * in the look's display face, sized to the circle. Mirrors the web Avatar.
 */
export function Avatar({
  path,
  name,
  userId,
  displayName,
  username,
  size = 40,
  decorative,
  style,
  glyphAt,
}: AvatarProps) {
  const tone = usePersonTone(userId);
  const t = useTheme();
  const [failed, setFailed] = useState(false);
  const uri = failed ? null : avatarUrl(supabase, path);
  const initials = initialsFor(
    displayName,
    username ?? name,
    glyphAt || size < TWO_INITIALS_MIN ? 1 : 2,
  );
  const two = initials.length > 1 && initials !== initialsFor(displayName, username ?? name, 1);
  const circle = { width: size, height: size, borderRadius: size / 2 };
  return (
    <View
      style={style}
      {...(decorative
        ? { accessibilityElementsHidden: true, importantForAccessibility: 'no-hide-descendants' }
        : { accessible: true, accessibilityRole: 'image', accessibilityLabel: name })}
      testID={uri ? undefined : `avatar-tone-${tone.name}`}
    >
      {uri ? (
        <Image
          source={{ uri }}
          style={circle}
          contentFit="cover"
          transition={120}
          onError={() => setFailed(true)}
          accessibilityIgnoresInvertColors
        />
      ) : (
        <View
          style={[
            circle,
            {
              backgroundColor: tone.fill,
              alignItems: 'center',
              justifyContent: 'center',
              // A faint inner edge of the ink keeps pale fills off pale surfaces (not in HC).
              borderWidth: t.highContrast ? 0 : StyleSheet.hairlineWidth,
              borderColor: `${tone.ink}1A`,
            },
          ]}
        >
          <Text
            display
            allowFontScaling={false}
            style={{
              color: tone.ink,
              fontWeight: '600',
              fontSize: Math.max(8, Math.round(size * (two ? 0.36 : 0.42))),
              letterSpacing: two ? size * 0.0072 : undefined,
              transform: glyphAt
                ? [
                    { translateX: Math.round((glyphAt.x - 0.5) * size) },
                    { translateY: Math.round((glyphAt.y - 0.5) * size) },
                  ]
                : undefined,
            }}
            testID={glyphAt ? `avatar-glyph-at-${glyphAt.x},${glyphAt.y}` : undefined}
          >
            {initials}
          </Text>
        </View>
      )}
    </View>
  );
}

export interface AvatarPerson {
  id: string;
  username: string;
  display_name?: string | null;
  avatar_path?: string | null;
}

/** The two members a group avatar shows: first two by id, so every device agrees. */
export function groupAvatarPair(members: readonly AvatarPerson[]): AvatarPerson[] {
  return [...members].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)).slice(0, 2);
}

const person = (p: AvatarPerson) => ({
  path: p.avatar_path,
  name: p.username,
  userId: p.id,
  displayName: p.display_name,
  username: p.username,
});

/**
 * A group avatar's layout (same as web): member circles `inner` across, the front one
 * bottom-right in a `ring` px border, and the back one's single initial centred at
 * `backGlyph` × inner on both axes, in the quarter the front leaves uncovered.
 */
export function groupAvatarGeometry(size: number) {
  return { inner: Math.round(size * 0.62), ring: 2, backGlyph: 0.37 };
}

/**
 * Two overlapping member avatars: the back one up-left, the front one down-right
 * with a 2 px ring in `ring` (the row's background: a border, not a shadow).
 * Pass the *other* members; one shows alone, none falls back to a group glyph.
 */
export function GroupAvatar({
  members,
  size = 48,
  label = 'Group',
  ring,
}: {
  members: readonly AvatarPerson[];
  size?: number;
  label?: string;
  ring?: string;
}) {
  const t = useTheme();
  const [back, front] = groupAvatarPair(members);
  const a11y = { accessible: true, accessibilityRole: 'image' as const, accessibilityLabel: label };
  if (!back)
    return (
      <View
        {...a11y}
        style={{
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: t.surfaceStrong,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Icon name="users" size={Math.round(size * 0.48)} color={t.textMuted} />
      </View>
    );
  if (!front)
    return (
      <View {...a11y}>
        <Avatar {...person(back)} size={size} decorative />
      </View>
    );
  const { inner, ring: ringWidth, backGlyph } = groupAvatarGeometry(size);
  return (
    <View {...a11y} style={{ width: size, height: size }} testID="group-avatar">
      <Avatar
        {...person(back)}
        size={inner}
        decorative
        style={{ position: 'absolute', left: 0, top: 0 }}
        glyphAt={{ x: backGlyph, y: backGlyph }}
      />
      <View
        style={{
          position: 'absolute',
          right: 0,
          bottom: 0,
          borderRadius: inner / 2 + ringWidth,
          borderWidth: ringWidth,
          borderColor: ring ?? t.surface,
        }}
      >
        <Avatar {...person(front)} size={inner} decorative />
      </View>
    </View>
  );
}

import { LOOKS, looks, type Look } from '@vybora/config';
import type { ModePref } from '@vybora/core';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import Svg, { Defs, Ellipse, RadialGradient, Stop } from 'react-native-svg';
import { GradientFill } from '@/components/GradientFill';
import { Icon } from '@/components/Icon';
import { Text } from '@/components/Text';
import { SectionCard, useCc } from '@/features/connect/ui/primitives';
import { Segmented } from '@/features/connect/ui/Segmented';
import { useAppearance } from '@/lib/appearance';
import { loadLookFonts, lookFontsLoaded } from '@/lib/fonts';
import { personToneStyle } from '@/lib/personTones';
import { LookScope, shadowStyle, useTheme } from '@/lib/theme';

const MODES: { value: ModePref; label: string }[] = [
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
  { value: 'system', label: 'Match system' },
];

/** Same copy as web Settings → Appearance. */
const DESCRIPTIONS: Record<Look, string> = {
  velvet: 'Warm and quiet, with emerald and gold.',
  aurora: 'Cool glass and drifting light.',
  bloom: 'Bright, soft and playful.',
};

/** The preview's stand-in person (a fixed id, so the tone is the same everywhere). */
const PREVIEW_ID = 'preview-maya';

const safeLoaded = (look: Look) => {
  try {
    return lookFontsLoaded(look);
  } catch {
    return false;
  }
};

/** The canvas behind the look: its background lit by up to three soft glows (static). */
function Glows() {
  const t = useTheme();
  const glows = [
    { c: t.glow1, cx: '0%', cy: '0%', rx: '120%', ry: '70%' },
    { c: t.glow2, cx: '100%', cy: '45%', rx: '90%', ry: '60%' },
    { c: t.glow3, cx: '30%', cy: '100%', rx: '90%', ry: '55%' },
  ].filter((g) => g.c !== 'transparent');
  if (!glows.length) return null;
  return (
    <Svg style={StyleSheet.absoluteFill} width="100%" height="100%">
      <Defs>
        {glows.map((g, i) => (
          <RadialGradient key={i} id={`glow-${t.look}-${i}`} cx="50%" cy="50%" r="50%">
            <Stop offset="0" stopColor={g.c} />
            <Stop offset="1" stopColor={g.c} stopOpacity={0} />
          </RadialGradient>
        ))}
      </Defs>
      {glows.map((g, i) => (
        <Ellipse
          key={i}
          cx={g.cx}
          cy={g.cy}
          rx={g.rx}
          ry={g.ry}
          fill={`url(#glow-${t.look}-${i})`}
        />
      ))}
    </Svg>
  );
}

/** A stand-in for a line of message text: previews never show real messages. */
function Bar({ width, color, opacity }: { width: `${number}%`; color: string; opacity: number }) {
  return <View style={{ height: 5, width, borderRadius: 3, backgroundColor: color, opacity }} />;
}

/**
 * A miniature chat drawn from the enclosing look's tokens: the header panel, an incoming
 * and an outgoing bubble, and the composer with the round primary send button.
 * Decorative: the card's name and description carry the meaning.
 */
function LookPreview() {
  const t = useTheme();
  const tone = personToneStyle(PREVIEW_ID, t.dark, t.highContrast, t.text, t.look);
  const r = t.radii;
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{ height: 172, backgroundColor: t.bg, overflow: 'hidden' }}
    >
      <Glows />
      <View
        style={{
          height: 40,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 8,
          paddingHorizontal: 12,
          backgroundColor: t.panel,
          borderBottomWidth: StyleSheet.hairlineWidth,
          borderBottomColor: t.border,
        }}
      >
        <View
          style={{
            width: 24,
            height: 24,
            borderRadius: 12,
            backgroundColor: tone.fill,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Text
            display
            allowFontScaling={false}
            style={{ color: tone.ink, fontSize: 11, fontWeight: '600' }}
          >
            M
          </Text>
        </View>
        <Text
          display
          allowFontScaling={false}
          style={{ color: t.text, fontSize: 13, fontWeight: '600', letterSpacing: -0.1 }}
        >
          Maya
        </Text>
        <View style={{ marginLeft: 'auto' }}>
          <Icon name="lock" size={11} color={t.textSubtle} weight="bold" />
        </View>
      </View>

      <View style={{ paddingHorizontal: 12, paddingTop: 12, gap: 6 }}>
        <View
          style={[
            {
              width: '68%',
              alignSelf: 'flex-start',
              gap: 6,
              paddingHorizontal: 10,
              paddingVertical: 9,
              backgroundColor: t.bubbleIn,
              borderWidth: StyleSheet.hairlineWidth,
              borderColor: t.border,
              borderRadius: r.md,
              borderBottomLeftRadius: r.sm,
            },
            shadowStyle(1, t),
          ]}
        >
          <Bar width="100%" color={t.textMuted} opacity={0.6} />
          <Bar width="60%" color={t.textMuted} opacity={0.6} />
        </View>
        <View
          style={[
            {
              width: '58%',
              alignSelf: 'flex-end',
              gap: 6,
              paddingHorizontal: 10,
              paddingVertical: 9,
              backgroundColor: t.bubbleOutTo,
              borderRadius: r.md,
              borderBottomRightRadius: r.sm,
            },
            shadowStyle(1, t),
          ]}
        >
          {!t.highContrast && (
            <GradientFill
              from={t.bubbleOutFrom}
              to={t.bubbleOutTo}
              angle={t.gradientAngle}
              radius={r.md}
              style={{ borderBottomRightRadius: r.sm }}
            />
          )}
          <Bar width="100%" color={t.bubbleOutText} opacity={0.8} />
          <Bar width="40%" color={t.bubbleOutText} opacity={0.8} />
        </View>
      </View>

      <View
        style={{
          position: 'absolute',
          left: 12,
          right: 12,
          bottom: 12,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 8,
        }}
      >
        <View
          style={{
            flex: 1,
            height: 32,
            justifyContent: 'center',
            paddingHorizontal: 12,
            borderRadius: 16,
            backgroundColor: t.panel,
            borderWidth: StyleSheet.hairlineWidth,
            borderColor: t.border,
          }}
        >
          <Bar width="40%" color={t.textSubtle} opacity={0.5} />
        </View>
        <View
          style={[
            {
              width: 32,
              height: 32,
              borderRadius: 16,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: t.primaryTo,
            },
            shadowStyle(1, t),
          ]}
        >
          {!t.highContrast && (
            <GradientFill
              from={t.primaryFrom}
              to={t.primaryTo}
              angle={t.gradientAngle}
              radius={16}
            />
          )}
          <Icon name="send" size={14} color={t.onPrimary} weight="fill" />
        </View>
      </View>
    </View>
  );
}

/**
 * One look as a radio: a live preview in that look's real tokens, fonts and shape (the
 * card is its own `LookScope`), in the current mode. Selected: an accent edge and a
 * filled check, never colour alone; the edge width is constant, so nothing shifts.
 */
function LookCard({
  look,
  selected,
  onPress,
}: {
  look: Look;
  selected: boolean;
  onPress: () => void;
}) {
  const t = useTheme();
  const r = t.radii.lg;
  return (
    <View style={[{ borderRadius: r, backgroundColor: t.surface }, shadowStyle(1, t)]}>
      <Pressable
        accessibilityRole="radio"
        accessibilityLabel={looks[look].name}
        accessibilityHint={DESCRIPTIONS[look]}
        accessibilityState={{ checked: selected }}
        onPress={onPress}
        style={({ pressed }) => ({
          borderRadius: r,
          borderWidth: 2,
          borderColor: selected ? t.accent : pressed ? t.borderStrong : t.border,
          backgroundColor: t.surface,
          overflow: 'hidden',
        })}
      >
        <LookPreview />
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'flex-start',
            gap: 12,
            paddingHorizontal: 14,
            paddingVertical: 12,
            borderTopWidth: StyleSheet.hairlineWidth,
            borderTopColor: t.border,
          }}
        >
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text
              display
              style={{
                color: t.text,
                fontSize: 17,
                lineHeight: 22,
                fontWeight: '600',
                letterSpacing: -0.2,
              }}
            >
              {looks[look].name}
            </Text>
            <Text style={{ color: t.textMuted, fontSize: 13, lineHeight: 18, marginTop: 2 }}>
              {DESCRIPTIONS[look]}
            </Text>
          </View>
          {selected ? (
            <View
              testID="look-selected"
              style={{
                width: 24,
                height: 24,
                borderRadius: 12,
                marginTop: 1,
                backgroundColor: t.accent,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Icon name="check" size={14} color={t.onAccent} weight="bold" />
            </View>
          ) : (
            <View
              style={{
                width: 24,
                height: 24,
                borderRadius: 12,
                marginTop: 1,
                borderWidth: 2,
                borderColor: t.borderStrong,
              }}
            />
          )}
        </View>
      </Pressable>
    </View>
  );
}

export default function AppearanceScreen() {
  const cc = useCc();
  const { look, mode, setLook, setMode } = useAppearance();
  // The previews need every look's faces, not just the active one.
  const [fontsReady, setFontsReady] = useState(() => LOOKS.every(safeLoaded));
  useEffect(() => {
    let alive = true;
    void Promise.all(LOOKS.map(loadLookFonts)).then(() => alive && setFontsReady(true));
    return () => {
      alive = false;
    };
  }, []);

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: cc.night }}
      contentContainerStyle={{ padding: 16, gap: 24, paddingBottom: 40 }}
    >
      <View style={{ gap: 8 }}>
        <Text
          accessibilityRole="header"
          style={{ color: cc.textMuted, fontSize: 13, fontWeight: '600', paddingHorizontal: 4 }}
        >
          Look
        </Text>
        {fontsReady ? (
          <View accessibilityRole="radiogroup" accessibilityLabel="Look" style={{ gap: 14 }}>
            {LOOKS.map((l) => (
              <LookScope key={l} look={l}>
                <LookCard look={l} selected={l === look} onPress={() => setLook(l)} />
              </LookScope>
            ))}
          </View>
        ) : (
          <ActivityIndicator color={cc.accent} style={{ paddingVertical: 48 }} />
        )}
      </View>

      <SectionCard title="Mode" footer="Saved on this device only.">
        <Segmented<ModePref> label="Mode" value={mode} options={MODES} onChange={setMode} />
      </SectionCard>
    </ScrollView>
  );
}

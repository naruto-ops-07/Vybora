import { useEffect, useId } from 'react';
import { StyleSheet } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Defs, Ellipse, RadialGradient, Stop } from 'react-native-svg';
import { useA11y } from '@/lib/a11y';
import { useTheme, type Theme } from '@/lib/theme';

/** Web parity (styles/workspace.css): Aurora drifts over 40 s, Bloom pulses over 6 s. */
const DRIFT_MS = 40_000;
const PULSE_MS = 6_000;

/** The glow's motion: the look's one ambient effect, or none (Velvet, reduced motion). */
export function glowMotion(t: Theme, reduceMotion: boolean): 'drift' | 'pulse' | 'none' {
  if (reduceMotion || t.highContrast) return 'none';
  return t.ambient;
}

/** Where each look's light sits (the web radial-gradient stops, as SVG ellipses). */
function lights(t: Theme) {
  if (t.look === 'velvet') return [{ c: t.glow1, cx: '50%', cy: '0%', rx: '60%', ry: '42%' }];
  if (t.look === 'bloom')
    return [
      { c: t.glow1, cx: '88%', cy: '6%', rx: '60%', ry: '46%' },
      { c: t.glow2, cx: '6%', cy: '92%', rx: '64%', ry: '52%' },
    ];
  return [
    { c: t.glow1, cx: '12%', cy: '4%', rx: '70%', ry: '55%' },
    { c: t.glow2, cx: '96%', cy: '40%', rx: '60%', ry: '50%' },
    { c: t.glow3, cx: '30%', cy: '98%', rx: '65%', ry: '50%' },
  ];
}

/**
 * The look's light behind a chat: oversized, fixed in the canvas while the thread
 * scrolls, never touchable and hidden from assistive tech. Aurora drifts (transform),
 * Bloom pulses (opacity), Velvet holds one still champagne light. Reduced motion holds
 * it still; high contrast leaves it out. Render it first inside the chat canvas.
 */
export function ChatGlow() {
  const t = useTheme();
  const { reduceMotion } = useA11y();
  // Plain SVG ids, unique per instance (React's ids contain colons).
  const uid = `vy-glow-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const motion = glowMotion(t, reduceMotion);
  const phase = useSharedValue(0);

  useEffect(() => {
    cancelAnimation(phase);
    phase.value = 0;
    if (motion === 'none') return;
    phase.value = withRepeat(
      withTiming(1, {
        duration: motion === 'drift' ? DRIFT_MS / 2 : PULSE_MS / 2,
        easing: Easing.inOut(Easing.sin),
      }),
      -1,
      true,
    );
    return () => cancelAnimation(phase);
  }, [motion, phase]);

  const animated = useAnimatedStyle(() => {
    if (motion === 'drift')
      return {
        transform: [
          { translateX: phase.value * 18 },
          { translateY: phase.value * 14 },
          { rotate: `${phase.value * 3}deg` },
        ],
      };
    if (motion === 'pulse') return { opacity: 0.72 + phase.value * 0.28 };
    return {};
  }, [motion]);

  if (t.highContrast) return null;
  const glows = lights(t).filter((g) => g.c !== 'transparent');
  if (!glows.length) return null;

  return (
    <Animated.View
      testID="chat-glow"
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[styles.glow, animated]}
    >
      <Svg width="100%" height="100%">
        <Defs>
          {glows.map((g, i) => (
            <RadialGradient key={i} id={`${uid}-${i}`} cx="50%" cy="50%" r="50%">
              <Stop offset="0" stopColor={g.c} />
              <Stop offset="1" stopColor={g.c} stopOpacity={0} />
            </RadialGradient>
          ))}
        </Defs>
        {glows.map((g, i) => (
          <Ellipse key={i} cx={g.cx} cy={g.cy} rx={g.rx} ry={g.ry} fill={`url(#${uid}-${i})`} />
        ))}
      </Svg>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  glow: { position: 'absolute', top: '-12%', left: '-12%', right: '-12%', bottom: '-12%' },
});

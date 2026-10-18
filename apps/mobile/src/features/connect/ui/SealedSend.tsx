import { SEAL_MS, sealFrame } from '@vybora/core';
import { useCallback, useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Path, Rect } from 'react-native-svg';
import { Icon } from '@/components/Icon';

/**
 * "Sealed send" on mobile: the same 320 ms timeline as web (`sealFrame` in
 * @vybora/core), sampled every 8 ms and replayed by Reanimated on the UI
 * thread. Opacity and transform only, inside the button's fixed 18 px glyph
 * box. Purely visual: the button keeps its label and nothing is announced.
 * Reduced motion turns it off completely.
 */
const STEP = 8;
const TIMES = Array.from({ length: Math.ceil(SEAL_MS.total / STEP) + 1 }, (_, i) =>
  Math.min(i * STEP, SEAL_MS.total),
);
const FRAMES = TIMES.map(sealFrame);
const PLANE = FRAMES.map((f) => f.plane);
const LOCK = FRAMES.map((f) => f.lock);
const SHACKLE = FRAMES.map((f) => f.shackleY);

/**
 * Drives the seal: `play()` starts (or restarts) one run; it ends by itself.
 * Off under reduced motion, and stops at once if reduced motion turns on.
 */
export function useSealedSend(reduceMotion: boolean) {
  const t = useSharedValue<number>(SEAL_MS.total);
  const [playing, setPlaying] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const play = useCallback(() => {
    if (reduceMotion) return;
    clearTimeout(timer.current);
    cancelAnimation(t);
    t.value = 0;
    t.value = withTiming(SEAL_MS.total, { duration: SEAL_MS.total, easing: Easing.linear });
    setPlaying(true);
    timer.current = setTimeout(() => setPlaying(false), SEAL_MS.total);
  }, [reduceMotion, t]);

  useEffect(() => {
    if (!reduceMotion) return;
    clearTimeout(timer.current);
    cancelAnimation(t);
    t.value = SEAL_MS.total;
    setPlaying(false);
  }, [reduceMotion, t]);

  useEffect(() => () => clearTimeout(timer.current), []);

  return { t, playing, play };
}

export type SealState = ReturnType<typeof useSealedSend>;

/** The send button's glyph: the plane, or (while playing) the plane giving way to a closing lock. */
export function SendGlyph({ seal, color }: { seal: SealState; color: string }) {
  const { t, playing } = seal;
  const plane = useAnimatedStyle(() => ({ opacity: interpolate(t.value, TIMES, PLANE) }));
  const lock = useAnimatedStyle(() => ({ opacity: interpolate(t.value, TIMES, LOCK) }));
  const shackle = useAnimatedStyle(() => ({
    transform: [{ translateY: interpolate(t.value, TIMES, SHACKLE) }],
  }));
  if (!playing) return <Icon name="send" size={18} color={color} weight="fill" />;
  return (
    <View style={{ width: 18, height: 18 }} testID="seal-playing">
      <Animated.View style={[{ position: 'absolute', inset: 0 }, plane]}>
        <Icon name="send" size={18} color={color} weight="fill" />
      </Animated.View>
      <Animated.View style={[{ position: 'absolute', inset: 0 }, lock]} testID="seal-lock">
        <Animated.View style={[{ position: 'absolute', inset: 0 }, shackle]}>
          <Svg width={18} height={18} viewBox="0 0 18 18" fill="none">
            <Path
              d="M5.9 8V5.4a3.1 3.1 0 0 1 6.2 0V8"
              stroke={color}
              strokeWidth={1.9}
              strokeLinecap="round"
            />
          </Svg>
        </Animated.View>
        <Svg width={18} height={18} viewBox="0 0 18 18" style={{ position: 'absolute' }}>
          <Rect x={2.75} y={7.75} width={12.5} height={8.5} rx={2} fill={color} />
        </Svg>
      </Animated.View>
    </View>
  );
}

import { SWIPE_REPLY_THRESHOLD, swipeReplyDecision } from '@vybora/core';
import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { Icon } from '@/components/Icon';
import { useA11y } from '@/lib/a11y';
import { useHaptics } from '@/lib/haptics';

const MAX = 96;

/** Drag a bubble right to reply (rightward only; vertical scrolling always wins). */
export function SwipeToReply({
  children,
  onReply,
  enabled,
  color,
}: {
  children: ReactNode;
  onReply: () => void;
  enabled: boolean;
  color: string;
}) {
  const { prefs, reduceMotion } = useA11y();
  const haptic = useHaptics();
  const x = useSharedValue(0);
  const armed = useSharedValue(false);

  const finish = (dx: number, dy: number, vx: number) => {
    if (swipeReplyDecision({ dx, dy, vx, released: true }) === 'trigger') onReply();
  };
  const tick = () => haptic('light');

  const pan = Gesture.Pan()
    .enabled(enabled && prefs.swipeToReply)
    .activeOffsetX([-1000, 12])
    .failOffsetY([-12, 12])
    .onUpdate((e) => {
      x.value = Math.max(0, Math.min(e.translationX, MAX));
      if (!armed.value && e.translationX >= SWIPE_REPLY_THRESHOLD) {
        armed.value = true;
        runOnJS(tick)();
      } else if (armed.value && e.translationX < SWIPE_REPLY_THRESHOLD) armed.value = false;
    })
    .onEnd((e) => {
      runOnJS(finish)(e.translationX, e.translationY, e.velocityX);
    })
    .onFinalize(() => {
      armed.value = false;
      x.value = reduceMotion ? 0 : withTiming(0, { duration: 180 });
    });

  const bubble = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }] }));
  const icon = useAnimatedStyle(() => ({
    opacity: interpolate(x.value, [0, SWIPE_REPLY_THRESHOLD], [0, 1], 'clamp'),
  }));

  return (
    <GestureDetector gesture={pan}>
      <View>
        <Animated.View
          pointerEvents="none"
          style={[
            { position: 'absolute', left: 16, top: 0, bottom: 0, justifyContent: 'center' },
            icon,
          ]}
        >
          <Icon name="corner-up-left" size={20} color={color} />
        </Animated.View>
        <Animated.View style={bubble}>{children}</Animated.View>
      </View>
    </GestureDetector>
  );
}

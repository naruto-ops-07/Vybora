import { useId } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';

/** SVG ends for a CSS-style angle: 180 runs top → bottom, 135 top-left → bottom-right. */
const ENDS = {
  180: { x1: '0', y1: '0', x2: '0', y2: '1' },
  135: { x1: '0', y1: '0', x2: '1', y2: '1' },
} as const;

/**
 * A two-stop linear gradient filling its parent (absolute fill, behind the content, not
 * touchable). The look's primary button and outgoing bubble draw with it. Callers render
 * a flat colour instead under high contrast.
 */
export function GradientFill({
  from,
  to,
  radius = 0,
  angle = 135,
  style,
}: {
  from: string;
  to: string;
  radius?: number;
  angle?: 180 | 135;
  style?: StyleProp<ViewStyle>;
}) {
  // SVG ids must be plain: React's ids contain colons.
  const id = `vy-grad-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  return (
    <View
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      testID="gradient-fill"
      style={[StyleSheet.absoluteFill, { borderRadius: radius, overflow: 'hidden' }, style]}
    >
      <Svg width="100%" height="100%">
        <Defs>
          <LinearGradient id={id} {...ENDS[angle]}>
            <Stop offset="0" stopColor={from} />
            <Stop offset="1" stopColor={to} />
          </LinearGradient>
        </Defs>
        <Rect x="0" y="0" width="100%" height="100%" rx={radius} ry={radius} fill={`url(#${id})`} />
      </Svg>
    </View>
  );
}

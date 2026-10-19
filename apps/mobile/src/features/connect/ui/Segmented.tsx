import { Pressable, View } from 'react-native';
import { Text } from '@/components/Text';
import { shadowStyle, tint, useTheme } from '@/lib/theme';
import { useCc } from './primitives';

/**
 * A radio group drawn as an inset track (muted, with a control edge) and an accent
 * thumb with soft depth on the checked option. One option is always on, and the label
 * weight never changes, so nothing reflows. High contrast: flat, no shadow. Sits inside
 * a `SectionCard`, so it carries its own margins.
 */
export function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
  disabled,
}: {
  label: string;
  value: T | undefined;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  disabled?: boolean;
}) {
  const t = useTheme();
  const cc = useCc();
  const outer = t.radii.md;
  const inner = Math.max(outer - 3, 2);
  return (
    <View
      accessibilityRole="radiogroup"
      accessibilityLabel={label}
      style={{
        flexDirection: 'row',
        gap: 3,
        padding: 3,
        borderWidth: 1,
        borderColor: cc.lineStrong,
        borderRadius: outer,
        backgroundColor: cc.raised,
        marginHorizontal: 16,
        marginVertical: 12,
        opacity: disabled ? 0.5 : 1,
      }}
    >
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Pressable
            key={o.value}
            accessibilityRole="radio"
            accessibilityLabel={o.label}
            accessibilityState={disabled ? { checked: on, disabled: true } : { checked: on }}
            disabled={disabled}
            onPress={() => onChange(o.value)}
            // The track's 3 px inset plus this keeps every touch target at 44 px or more.
            hitSlop={{ top: 4, bottom: 4 }}
            style={({ pressed }) => [
              {
                flex: 1,
                minHeight: 40,
                paddingHorizontal: 6,
                paddingVertical: 8,
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: inner,
                backgroundColor: on ? cc.accent : pressed ? tint(cc.text, '14') : undefined,
              },
              on ? shadowStyle(1, t) : null,
            ]}
          >
            <Text
              style={{
                color: on ? cc.onAccent : cc.text,
                fontWeight: '500',
                fontSize: 14,
                textAlign: 'center',
              }}
            >
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

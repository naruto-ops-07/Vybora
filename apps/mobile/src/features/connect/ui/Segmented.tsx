import { Pressable, View } from 'react-native';
import { Text } from '@/components/Text';
import { radii } from '@/lib/theme';
import { useCc } from './primitives';

/**
 * A rectangular radio group (not a pill): one option is always on. Sits inside
 * a `SectionCard`, so it carries its own horizontal and vertical margin.
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
  const cc = useCc();
  return (
    <View
      accessibilityRole="radiogroup"
      accessibilityLabel={label}
      style={{
        flexDirection: 'row',
        borderWidth: 1,
        borderColor: cc.lineStrong,
        borderRadius: radii.md,
        overflow: 'hidden',
        marginHorizontal: 16,
        marginVertical: 12,
        opacity: disabled ? 0.5 : 1,
      }}
    >
      {options.map((o, i) => {
        const on = o.value === value;
        return (
          <Pressable
            key={o.value}
            accessibilityRole="radio"
            accessibilityLabel={o.label}
            accessibilityState={disabled ? { checked: on, disabled: true } : { checked: on }}
            disabled={disabled}
            onPress={() => onChange(o.value)}
            style={{
              flex: 1,
              minHeight: 44,
              alignItems: 'center',
              justifyContent: 'center',
              borderLeftWidth: i ? 1 : 0,
              borderLeftColor: cc.lineStrong,
              backgroundColor: on ? cc.accent : 'transparent',
            }}
          >
            <Text style={{ color: on ? cc.onAccent : cc.text, fontWeight: '500', fontSize: 14 }}>
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

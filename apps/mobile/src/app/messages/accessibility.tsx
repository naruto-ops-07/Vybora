import type { ReduceMotionPref, TextSize } from '@vybora/core';
import { Pressable, ScrollView, Switch, View } from 'react-native';
import { Text } from '@/components/Text';
import { Row, SectionCard, useCc } from '@/features/connect/ui/primitives';
import { useA11y } from '@/lib/a11y';
import { radii } from '@/lib/theme';

function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
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
      }}
    >
      {options.map((o, i) => {
        const on = o.value === value;
        return (
          <Pressable
            key={o.value}
            accessibilityRole="radio"
            accessibilityLabel={o.label}
            accessibilityState={{ checked: on }}
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

export default function AccessibilityScreen() {
  const cc = useCc();
  const { prefs, setPrefs } = useA11y();
  const toggle = (label: string, value: boolean, onChange: (v: boolean) => void) => (
    <Switch
      accessibilityLabel={label}
      value={value}
      onValueChange={onChange}
      trackColor={{ true: cc.accent, false: cc.strong }}
    />
  );
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: cc.night }}
      contentContainerStyle={{ padding: 16, gap: 20 }}
    >
      <SectionCard title="Motion & gestures">
        <Text
          style={{
            color: cc.text,
            fontSize: 15,
            fontWeight: '500',
            paddingHorizontal: 16,
            paddingTop: 12,
          }}
        >
          Reduce motion
        </Text>
        <Segmented<ReduceMotionPref>
          label="Reduce motion"
          value={prefs.reduceMotion}
          options={[
            { value: 'system', label: 'Match system' },
            { value: 'on', label: 'On' },
            { value: 'off', label: 'Off' },
          ]}
          onChange={(reduceMotion) => setPrefs({ reduceMotion })}
        />
        <Row
          icon="corner-up-left"
          label="Swipe to reply"
          description="Drag a message right to reply. Reply is always in the long-press menu."
          right={toggle('Swipe to reply', prefs.swipeToReply, (swipeToReply) =>
            setPrefs({ swipeToReply }),
          )}
        />
        <Row
          icon="smartphone"
          label="Haptics"
          description="A light tap when a swipe or menu responds."
          right={toggle('Haptics', prefs.haptics, (haptics) => setPrefs({ haptics }))}
        />
      </SectionCard>

      <SectionCard title="Text">
        <Segmented<TextSize>
          label="Message text size"
          value={prefs.textSize}
          options={[
            { value: 'sm', label: 'Small' },
            { value: 'md', label: 'Default' },
            { value: 'lg', label: 'Large' },
            { value: 'xl', label: 'Extra large' },
          ]}
          onChange={(textSize) => setPrefs({ textSize })}
        />
        <Text
          scale
          style={{
            color: cc.text,
            fontSize: 15,
            lineHeight: 21,
            margin: 16,
            marginTop: 0,
            padding: 10,
            borderWidth: 1,
            borderColor: cc.line,
            borderRadius: radii.lg,
            borderBottomLeftRadius: radii.sm,
            backgroundColor: cc.bubbleIn,
          }}
        >
          This is how messages will look.
        </Text>
      </SectionCard>

      <SectionCard title="Display">
        <Row
          icon="eye"
          label="High contrast"
          description="Stronger text and borders in light and dark themes."
          right={toggle('High contrast', prefs.highContrast, (highContrast) =>
            setPrefs({ highContrast }),
          )}
        />
        <Row
          icon="more-horizontal"
          label="Always show message actions"
          description="Show a reply button on every message instead of only in the long-press menu."
          right={toggle(
            'Always show message actions',
            prefs.alwaysShowActions,
            (alwaysShowActions) => setPrefs({ alwaysShowActions }),
          )}
        />
      </SectionCard>
      <Text style={{ color: cc.textSubtle, fontSize: 12, paddingHorizontal: 4 }}>
        Saved on this device only.
      </Text>
    </ScrollView>
  );
}

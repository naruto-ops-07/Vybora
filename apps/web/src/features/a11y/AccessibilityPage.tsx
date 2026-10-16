import {
  ArrowBendUpLeftIcon,
  CircleHalfIcon,
  CursorClickIcon,
  WaveformIcon,
} from '@phosphor-icons/react';
import type { ReduceMotionPref, TextSize } from '@vybora/core';
import { Toggle } from '@/components/ui/Field';
import { Segmented } from '@/components/ui/Segmented';
import { Row, Section } from '@/features/connect/ui';
import { SettingsPage } from '@/features/settings/SettingsNav';
import { useA11y } from './A11yProvider';

const MOTION: { value: ReduceMotionPref; label: string }[] = [
  { value: 'system', label: 'Match system' },
  { value: 'on', label: 'On' },
  { value: 'off', label: 'Off' },
];
const SIZES: { value: TextSize; label: string }[] = [
  { value: 'sm', label: 'Small' },
  { value: 'md', label: 'Default' },
  { value: 'lg', label: 'Large' },
  { value: 'xl', label: 'Extra large' },
];

export default function AccessibilityPage() {
  const { prefs, setPrefs } = useA11y();
  return (
    <SettingsPage title="Accessibility">
      <Section title="Motion & gestures" footer="Saved on this device only.">
        <div className="space-y-2 px-4 py-3">
          <p className="flex items-center gap-3 text-sm font-medium">
            <WaveformIcon size={18} className="text-muted" aria-hidden="true" /> Reduce motion
          </p>
          <Segmented
            label="Reduce motion"
            value={prefs.reduceMotion}
            options={MOTION}
            onChange={(reduceMotion) => setPrefs({ reduceMotion })}
          />
        </div>
        <Row
          icon={<ArrowBendUpLeftIcon size={18} />}
          label="Swipe to reply"
          description="On touch screens, drag a message right to reply. Reply is always in the message menu."
          right={
            <Toggle
              label="Swipe to reply"
              checked={prefs.swipeToReply}
              onChange={(swipeToReply) => setPrefs({ swipeToReply })}
            />
          }
        />
      </Section>

      <Section title="Text">
        <div className="space-y-3 px-4 py-3">
          <Segmented
            label="Message text size"
            value={prefs.textSize}
            options={SIZES}
            onChange={(textSize) => setPrefs({ textSize })}
          />
          <p className="text-msg rounded-lg rounded-bl-sm border border-line bg-bubble-in px-3 py-2">
            This is how messages will look.
          </p>
        </div>
      </Section>

      <Section title="Display">
        <Row
          icon={<CircleHalfIcon size={18} />}
          label="High contrast"
          description="Stronger text and borders in light and dark themes. Links are underlined."
          right={
            <Toggle
              label="High contrast"
              checked={prefs.highContrast}
              onChange={(highContrast) => setPrefs({ highContrast })}
            />
          }
        />
        <Row
          icon={<CursorClickIcon size={18} />}
          label="Always show message actions"
          description="Reply, react and more stay visible instead of appearing on hover."
          right={
            <Toggle
              label="Always show message actions"
              checked={prefs.alwaysShowActions}
              onChange={(alwaysShowActions) => setPrefs({ alwaysShowActions })}
            />
          }
        />
      </Section>
    </SettingsPage>
  );
}

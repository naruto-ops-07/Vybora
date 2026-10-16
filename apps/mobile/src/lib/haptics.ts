import * as Haptics from 'expo-haptics';
import { useCallback } from 'react';
import { useA11y } from './a11y';

export type HapticKind = 'light' | 'medium' | 'selection';

/** Haptic feedback that respects Settings → Accessibility → Haptics. */
export function useHaptics() {
  const { prefs } = useA11y();
  return useCallback(
    (kind: HapticKind) => {
      if (!prefs.haptics) return;
      if (kind === 'selection') void Haptics.selectionAsync().catch(() => undefined);
      else
        void Haptics.impactAsync(
          kind === 'light' ? Haptics.ImpactFeedbackStyle.Light : Haptics.ImpactFeedbackStyle.Medium,
        ).catch(() => undefined);
    },
    [prefs.haptics],
  );
}

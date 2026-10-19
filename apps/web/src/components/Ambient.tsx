import { looks } from '@vybora/config';
import { useA11y } from '@/features/a11y/A11yProvider';
import { useDocumentLook } from '@/features/connect/ui';
import { cn } from '@/lib/cn';

/**
 * The look's light (styles/workspace.css `.vy-glow`) behind a signed-out surface: the
 * hero, the auth brand panel, the 404. Aurora drifts and Bloom pulses (the look's one
 * ambient effect), Velvet is a still candle-glow; reduced motion holds it still and high
 * contrast leaves it out. Place it first inside a `relative overflow-hidden` box and give
 * the content `vy-canvas-layer`.
 */
export function Ambient({ className }: { className?: string }) {
  const { look } = useDocumentLook();
  const { prefs, reduceMotion } = useA11y();
  if (prefs.highContrast) return null;
  const ambient = looks[look].ambient;
  return (
    <div
      className={cn('vy-glow', className)}
      aria-hidden="true"
      data-ambient={reduceMotion || ambient === 'none' ? 'none' : ambient}
    />
  );
}

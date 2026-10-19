import { looks } from '@vybora/config';
import { useA11y } from '@/features/a11y/A11yProvider';
import { useDocumentLook } from './ui';

/**
 * The look's light behind a chat (styles/workspace.css `.vy-glow`): fixed in the canvas
 * while the thread scrolls, never a pointer target, read by no one. Aurora drifts and
 * Bloom pulses (the look's one ambient effect); reduced motion holds it still, and high
 * contrast leaves it out. Place it first inside a `relative overflow-hidden` canvas.
 */
export function ChatGlow() {
  const { look } = useDocumentLook();
  const { prefs, reduceMotion } = useA11y();
  if (prefs.highContrast) return null;
  const ambient = looks[look].ambient;
  return (
    <div
      className="vy-glow"
      aria-hidden="true"
      data-chat-glow=""
      data-ambient={reduceMotion || ambient === 'none' ? 'none' : ambient}
    />
  );
}

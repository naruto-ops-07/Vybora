import * as RadixTooltip from '@radix-ui/react-tooltip';
import type { ReactElement, ReactNode } from 'react';

/** The shared popover surface at elevation 2, small (styles/primitives.css). */
export const tooltipContentClass =
  'tip vy-popover z-50 flex items-center gap-2 rounded-sm px-2 py-1 text-xs font-medium';

export const TooltipProvider = ({ children }: { children: ReactNode }) => (
  <RadixTooltip.Provider delayDuration={400} skipDelayDuration={200}>
    {children}
  </RadixTooltip.Provider>
);

/**
 * Hover/focus label for icon-only controls. The trigger keeps its own
 * aria-label; the tooltip adds the visible name and an optional shortcut.
 */
export function Tip({
  label,
  shortcut,
  side = 'bottom',
  children,
}: {
  label: string;
  shortcut?: string;
  side?: 'top' | 'bottom' | 'left' | 'right';
  children: ReactElement;
}) {
  return (
    <RadixTooltip.Root>
      <RadixTooltip.Trigger asChild>{children}</RadixTooltip.Trigger>
      <RadixTooltip.Portal>
        <RadixTooltip.Content
          side={side}
          sideOffset={6}
          collisionPadding={8}
          className={tooltipContentClass}
        >
          {label}
          {shortcut && <kbd className="font-mono text-[11px] text-subtle">{shortcut}</kbd>}
        </RadixTooltip.Content>
      </RadixTooltip.Portal>
    </RadixTooltip.Root>
  );
}

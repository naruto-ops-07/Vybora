import { clsx, type ClassValue } from 'clsx';
import { extendTailwindMerge } from 'tailwind-merge';

/**
 * tailwind-merge, taught our own utilities. `text-msg` / `text-msg-sm` are font
 * sizes (they follow Accessibility → Text size); without this, tailwind-merge
 * reads them as text colours and drops them beside `text-muted`.
 */
const merge = extendTailwindMerge({
  extend: {
    classGroups: {
      'font-size': [{ text: ['msg', 'msg-sm'] }],
    },
  },
});

/** Join class names; a later Tailwind class wins over a conflicting earlier one. */
export function cn(...inputs: ClassValue[]) {
  return merge(clsx(inputs));
}

import { describe, expect, it } from 'vitest';
import { buttonClasses } from '@/components/ui/Button';
import { cn } from './cn';

describe('cn', () => {
  it('joins conditional classes like clsx', () => {
    const off = false as boolean;
    expect(cn('a', off && 'b', null, undefined, ['c', { d: true, e: false }])).toBe('a c d');
  });

  it('lets a later Tailwind class win a conflict', () => {
    expect(cn('bg-accent text-on-accent', 'bg-[#2DD4BF] text-[#04201D]')).toBe(
      'bg-[#2DD4BF] text-[#04201D]',
    );
    expect(cn('hover:bg-accent-hover', 'hover:bg-[#5EEAD4]')).toBe('hover:bg-[#5EEAD4]');
    expect(cn('disabled:opacity-45', 'disabled:opacity-100')).toBe('disabled:opacity-100');
    expect(cn('px-3 py-2', 'px-1')).toBe('py-2 px-1');
  });

  it('keeps the message text sizes beside a text colour', () => {
    // Without the extension tailwind-merge reads `text-msg` as a colour and drops it.
    expect(cn('text-msg', 'text-muted')).toBe('text-msg text-muted');
    expect(cn('text-msg-sm text-muted')).toBe('text-msg-sm text-muted');
    expect(cn('text-msg', 'text-sm')).toBe('text-sm');
  });

  it('leaves our own utilities and unrelated groups alone', () => {
    expect(cn('touch-target h-8 w-8')).toBe('touch-target h-8 w-8');
    expect(cn('pb-safe py-2.5')).toBe('pb-safe py-2.5');
    expect(cn('border border-line', 'border-2')).toBe('border-line border-2');
    expect(cn('text-[13px] text-muted')).toBe('text-[13px] text-muted');
  });

  it('lets a button’s className override its variant', () => {
    const cls = buttonClasses({ className: 'bg-[#2DD4BF] text-[#04201D] hover:bg-[#5EEAD4]' });
    expect(cls).not.toMatch(/\bbg-accent\b|\btext-on-accent\b|hover:bg-accent-hover/);
    expect(cls).toContain('bg-[#2DD4BF]');
    const outline = buttonClasses({
      variant: 'outline',
      className: 'border-[#E6EEEE]/40 text-[#E6EEEE] hover:bg-white/10',
    });
    expect(outline).not.toMatch(/border-line-strong|\btext-ink\b|hover:bg-surface-muted/);
    expect(outline).toMatch(/\bborder\b/);
  });
});

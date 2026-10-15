import type { ChatTheme } from '@vybora/api';
import { highContrastThemes } from '@vybora/config';
import { A11Y_STORAGE_KEY } from '@vybora/core';
import { renderHook, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { renderWithProviders } from '@/test/utils';
import { chatBackground, useChatTheme } from '@/features/connect/ui';
import { A11yProvider } from './A11yProvider';
import AccessibilityPage from './AccessibilityPage';

afterEach(() => localStorage.clear());

describe('Accessibility settings', () => {
  it('applies and saves high contrast, text size and motion on this device', async () => {
    const user = userEvent.setup();
    renderWithProviders(<AccessibilityPage />);
    const html = document.documentElement;

    await user.click(screen.getByRole('switch', { name: 'High contrast' }));
    expect(html.dataset.contrast).toBe('high');

    await user.click(screen.getByRole('radio', { name: 'Large' }));
    expect(html.dataset.textSize).toBe('lg');

    await user.click(screen.getByRole('radio', { name: 'On' }));
    expect(html.dataset.reduceMotion).toBe('true');

    expect(JSON.parse(localStorage.getItem(A11Y_STORAGE_KEY)!)).toMatchObject({
      highContrast: true,
      textSize: 'lg',
      reduceMotion: 'on',
    });
  });

  it('restores saved settings on the next visit', () => {
    localStorage.setItem(
      A11Y_STORAGE_KEY,
      JSON.stringify({ textSize: 'xl', alwaysShowActions: true }),
    );
    renderWithProviders(<AccessibilityPage />);
    expect(document.documentElement.dataset.textSize).toBe('xl');
    expect(screen.getByRole('radio', { name: 'Extra large' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    expect(screen.getByRole('switch', { name: 'Always show message actions' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
  });
});

describe('Accessibility radio groups', () => {
  it('follow the ARIA radio pattern: one tab stop, arrows move and select', async () => {
    const user = userEvent.setup();
    renderWithProviders(<AccessibilityPage />);
    const group = screen.getByRole('radiogroup', { name: 'Message text size' });
    const radios = within(group).getAllByRole('radio');
    const checked = radios.find((r) => r.getAttribute('aria-checked') === 'true')!;
    expect(radios.filter((r) => r.tabIndex === 0)).toEqual([checked]);

    checked.focus();
    await user.keyboard('{ArrowRight}');
    const next = radios[radios.indexOf(checked) + 1]!;
    expect(next).toHaveFocus();
    expect(next).toHaveAttribute('aria-checked', 'true');
    expect(next.tabIndex).toBe(0);
    expect(checked.tabIndex).toBe(-1);

    await user.keyboard('{ArrowLeft}{ArrowUp}');
    const prev = radios[radios.indexOf(checked) - 1]!;
    expect(prev).toHaveFocus();
    expect(prev).toHaveAttribute('aria-checked', 'true');
    expect(document.documentElement.dataset.textSize).toBe('sm');

    // Wraps around from the first option to the last.
    await user.keyboard('{ArrowUp}');
    expect(radios.at(-1)).toHaveFocus();
    expect(radios.at(-1)).toHaveAttribute('aria-checked', 'true');
  });
});

describe('High contrast in chats', () => {
  const theme: ChatTheme = { preset: 'rose', wallpaper: 'stars' };

  it('overrides the chat theme with the high-contrast accent and drops the wallpaper', () => {
    localStorage.setItem(A11Y_STORAGE_KEY, JSON.stringify({ highContrast: true }));
    const { result } = renderHook(() => useChatTheme(theme), { wrapper: A11yProvider });
    const hc = highContrastThemes.light;
    expect(result.current).toMatchObject({
      bubble: hc.accent,
      bubbleText: hc.onAccent,
      accent: hc.accent,
      highContrast: true,
    });
    expect(chatBackground(theme, result.current)).toEqual({});
  });

  it('keeps the chat theme and wallpaper otherwise', () => {
    const { result } = renderHook(() => useChatTheme(theme), { wrapper: A11yProvider });
    expect(result.current.bubble).not.toBe(highContrastThemes.light.accent);
    expect(chatBackground(theme, result.current)).toHaveProperty('backgroundImage');
  });
});

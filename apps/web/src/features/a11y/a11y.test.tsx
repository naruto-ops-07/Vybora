import { A11Y_STORAGE_KEY } from '@vybora/core';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { renderWithProviders } from '@/test/utils';
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

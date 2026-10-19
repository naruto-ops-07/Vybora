import { APPEARANCE_KEY } from '@vybora/core';
import { act, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { reloadAppearance } from '@/lib/theme';
import { renderWithProviders } from '@/test/utils';
import AccountSettingsPage from './AccountSettingsPage';
import AppearancePage from './AppearancePage';

vi.mock('@/lib/supabase', () => ({ supabase: {} }));
vi.mock('@/features/auth/AuthProvider', () => ({
  useMe: () => ({ userId: 'me', profile: { username: 'me' } }),
  useAuth: () => ({ session: { user: { email: 'me@example.com' } } }),
}));

const html = document.documentElement;
const stored = () => JSON.parse(localStorage.getItem(APPEARANCE_KEY) ?? 'null');

beforeEach(() => {
  localStorage.clear();
  act(() => reloadAppearance());
});
afterEach(() => {
  localStorage.clear();
  act(() => reloadAppearance());
});

describe('Settings → Appearance', () => {
  it('starts on Velvet, matching the system', () => {
    renderWithProviders(<AppearancePage />);
    expect(screen.getByRole('radio', { name: 'Velvet' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('radio', { name: 'Match system' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    expect(html.dataset.look).toBe('velvet');
    expect(screen.getByText('Saved on this device only.')).toBeInTheDocument();
  });

  it('picking Aurora applies it and saves it on this device', async () => {
    const user = userEvent.setup();
    renderWithProviders(<AppearancePage />);
    await user.click(screen.getByRole('radio', { name: 'Aurora' }));
    expect(html.dataset.look).toBe('aurora');
    expect(stored()).toEqual({ look: 'aurora', mode: 'system' });
    expect(screen.getByRole('radio', { name: 'Aurora' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('radio', { name: 'Velvet' })).toHaveAttribute('aria-checked', 'false');
  });

  it('the Dark segment switches to dark', async () => {
    const user = userEvent.setup();
    renderWithProviders(<AppearancePage />);
    await user.click(screen.getByRole('radio', { name: 'Dark' }));
    expect(html.dataset.theme).toBe('dark');
    expect(stored()).toEqual({ look: 'velvet', mode: 'dark' });
    await user.click(screen.getByRole('radio', { name: 'Light' }));
    expect(html.dataset.theme).toBe('light');
  });

  it('each card previews its look through a scoped data-look wrapper', () => {
    const { container } = renderWithProviders(<AppearancePage />);
    const scoped = [...container.querySelectorAll<HTMLElement>('[data-look]')].map(
      (e) => e.dataset.look,
    );
    expect(scoped).toEqual(['velvet', 'aurora', 'bloom']);
  });

  it('the look cards are a labelled radio group: one tab stop, arrows move and select', async () => {
    const user = userEvent.setup();
    renderWithProviders(<AppearancePage />);
    const group = screen.getByRole('radiogroup', { name: 'Look' });
    const radios = within(group).getAllByRole('radio');
    expect(radios.map((r) => r.getAttribute('tabindex'))).toEqual(['0', '-1', '-1']);
    // Selected is marked by more than colour: a check mark and text for assistive tech.
    expect(within(radios[0]!).getByTestId('look-selected')).toBeInTheDocument();
    expect(within(radios[1]!).queryByTestId('look-selected')).toBeNull();

    radios[0]!.focus();
    await user.keyboard('{ArrowRight}');
    expect(html.dataset.look).toBe('aurora');
    expect(within(group).getByRole('radio', { name: 'Aurora' })).toHaveFocus();
    await user.keyboard('{ArrowDown}');
    expect(html.dataset.look).toBe('bloom');
    await user.keyboard('{ArrowRight}');
    expect(html.dataset.look).toBe('velvet');
    expect(within(group).getByRole('radio', { name: 'Velvet' })).toHaveFocus();
    await user.keyboard('{ArrowLeft}');
    expect(html.dataset.look).toBe('bloom');
    expect(stored()).toEqual({ look: 'bloom', mode: 'system' });
  });
});

describe('appearance storage', () => {
  it('migrates the old vybora-theme key once and removes it', () => {
    localStorage.setItem('vybora-theme', 'dark');
    act(() => reloadAppearance());
    expect(stored()).toEqual({ look: 'velvet', mode: 'dark' });
    expect(localStorage.getItem('vybora-theme')).toBeNull();
    expect(html.dataset.theme).toBe('dark');
    expect(html.dataset.look).toBe('velvet');
  });

  it('falls back to Velvet, matching the system, on garbage', () => {
    localStorage.setItem(APPEARANCE_KEY, '{"look":"neon",');
    act(() => reloadAppearance());
    renderWithProviders(<AppearancePage />);
    expect(html.dataset.look).toBe('velvet');
    expect(screen.getByRole('radio', { name: 'Velvet' })).toHaveAttribute('aria-checked', 'true');
  });

  it('sets the browser theme colour to the look’s background', async () => {
    const meta = document.createElement('meta');
    meta.name = 'theme-color';
    document.head.append(meta);
    const user = userEvent.setup();
    renderWithProviders(<AppearancePage />);
    await user.click(screen.getByRole('radio', { name: 'Dark' }));
    await user.click(screen.getByRole('radio', { name: 'Bloom' }));
    expect(meta.content).toBe('#17121F');
    meta.remove();
  });
});

describe('Account settings', () => {
  it('no longer shows a theme control', () => {
    renderWithProviders(<AccountSettingsPage />);
    expect(screen.queryByRole('radiogroup')).toBeNull();
    expect(screen.queryByRole('radio', { name: 'Dark' })).toBeNull();
    expect(screen.queryByText('Appearance')).toBeNull();
  });
});

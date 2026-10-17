import { screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '@/test/utils';
import Landing from './Landing';

vi.mock('@/lib/supabase', () => ({ supabase: {} }));

describe('Landing', () => {
  it('lists six features, including friends by username, with no orphan in the grid', () => {
    renderWithProviders(<Landing />);
    const strip = screen.getByRole('region', { name: 'Features' });
    const titles = within(strip)
      .getAllByRole('heading', { level: 3 })
      .map((h) => h.textContent);
    expect(titles).toHaveLength(6);
    expect(titles).toContain('Friends by username');
    expect(
      within(strip).getByText(
        'Add people by their exact username. Choose whether only friends can start chats with you.',
      ),
    ).toBeInTheDocument();
    // Six items: 1 column, then 2 × 3, then 3 × 2. Never 5 columns (an orphan of one).
    const grid = strip.firstElementChild!;
    expect(grid).toHaveClass('sm:grid-cols-2', 'lg:grid-cols-3');
    expect(grid.className).not.toMatch(/grid-cols-(4|5)\b/);
  });

  it('gives the closing calls to action their own colours without !important', () => {
    renderWithProviders(<Landing />);
    const create = screen
      .getAllByRole('link', { name: 'Create your account' })
      .find((a) => a.className.includes('bg-[#2DD4BF]'))!;
    expect(create).toHaveClass('bg-[#2DD4BF]', 'text-[#04201D]');
    expect(create).not.toHaveClass('bg-accent', 'text-on-accent');
    const signIn = screen
      .getAllByRole('link', { name: 'Sign in' })
      .find((a) => a.className.includes('text-[#E6EEEE]'))!;
    expect(signIn).not.toHaveClass('text-ink', 'border-line-strong');
    for (const a of [create, signIn]) expect(a.className).not.toMatch(/!/);
  });
});

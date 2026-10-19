import { A11Y_STORAGE_KEY, APPEARANCE_KEY } from '@vybora/core';
import userEvent from '@testing-library/user-event';
import { screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { applyInitialAppearance } from '@/lib/theme';
import { renderWithProviders } from '@/test/utils';
import Landing from './Landing';

vi.mock('@/lib/supabase', () => ({ supabase: {} }));

describe('Landing', () => {
  const TITLES = [
    'Friends by username',
    'Groups with roles',
    'Disappearing messages',
    'Phone and web',
    'Encrypted by default',
    'Verify, don’t trust',
  ];

  it('keeps all six features, social first, in two columns rather than a grid of icon cards', () => {
    renderWithProviders(<Landing />);
    const strip = screen.getByRole('region', { name: 'Features' });
    expect(strip.querySelector('[class*="grid-cols-3"]')).toBeNull();
    const titles = within(strip)
      .getAllByRole('heading', { level: 3 })
      .map((h) => h.textContent);
    expect(titles).toEqual(TITLES);
    expect(
      within(strip).getByText(
        'Add people by their exact username, no phone number needed. Choose whether only friends can start chats with you.',
      ),
    ).toBeInTheDocument();
    // Two columns: what people come for, then what keeps it private. Three features each,
    // each with a display-face heading.
    const columns = within(strip).getAllByRole('list');
    expect(columns).toHaveLength(2);
    expect(
      within(columns[0]!)
        .getAllByRole('heading', { level: 3 })
        .map((h) => h.textContent),
    ).toEqual(TITLES.slice(0, 3));
    expect(
      within(columns[1]!)
        .getAllByRole('heading', { level: 3 })
        .map((h) => h.textContent),
    ).toEqual(TITLES.slice(3));
    for (const h of within(strip).getAllByRole('heading', { level: 3 }))
      expect(h).toHaveClass('type-display');
  });

  it('closes on the look’s primary gradient band, with the agreed line', () => {
    renderWithProviders(<Landing />);
    const band = screen
      .getByRole('heading', { name: 'Bring your circle. Keep it between you.' })
      .closest('section')!;
    expect(band).toHaveClass('bg-primary-gradient', 'text-on-primary');
    expect(band.className).not.toMatch(/#[0-9a-f]{6}/i);
    for (const a of within(band).getAllByRole('link'))
      expect(a.className).not.toMatch(/!|#[0-9a-f]{6}/i);
    expect(screen.getByText('Encryption not yet independently audited.')).toBeInTheDocument();
  });
});

describe('How a message travels, under reduced motion', () => {
  afterEach(() => localStorage.clear());

  it('is a plain section whose steps can be picked, with nothing pinned to the scroll', async () => {
    localStorage.setItem(A11Y_STORAGE_KEY, JSON.stringify({ reduceMotion: 'on' }));
    renderWithProviders(<Landing />);
    const section = screen.getByRole('region', { name: 'How a message travels' });
    expect(section.className).not.toMatch(/h-\[320vh\]/);
    const third = within(section).getByRole('button', {
      name: 'Show step 3: VYBORA relays ciphertext',
    });
    await userEvent.click(third);
    expect(third).toHaveAttribute('aria-pressed', 'true');
    expect(within(section).getByRole('img', { name: /^Step 3:/ })).toBeInTheDocument();
  });
});

describe('Landing in the saved look', () => {
  afterEach(() => {
    localStorage.clear();
    delete document.documentElement.dataset.look;
    delete document.documentElement.dataset.theme;
  });

  it('is in Bloom light from first paint when that look is saved on the device', () => {
    localStorage.setItem(APPEARANCE_KEY, JSON.stringify({ look: 'bloom', mode: 'light' }));
    // What index.html's pre-paint script does, before React renders anything.
    applyInitialAppearance();
    const html = document.documentElement;
    expect(html.dataset.look).toBe('bloom');
    expect(html.dataset.theme).toBe('light');
    renderWithProviders(<Landing />);
    expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
    expect(html.dataset.look).toBe('bloom');
  });

  it('falls back to Velvet with nothing saved', () => {
    applyInitialAppearance();
    expect(document.documentElement.dataset.look).toBe('velvet');
  });

  it('puts the look’s ambient light behind the hero and depth on the demo card', () => {
    renderWithProviders(<Landing />);
    const hero = screen.getByRole('heading', { level: 1 }).closest('section')!;
    expect(hero.querySelector('.vy-glow[aria-hidden="true"]')).not.toBeNull();
    const demo = within(hero).getByLabelText('Type a message').closest('[data-seal-demo]')!;
    expect(demo).toHaveClass('shadow-3');
  });

  it('frosts the header in Aurora only', () => {
    document.documentElement.dataset.look = 'aurora';
    const { unmount } = renderWithProviders(<Landing />);
    expect(screen.getByRole('banner')).toHaveClass('vy-panel');
    unmount();
    document.documentElement.dataset.look = 'velvet';
    renderWithProviders(<Landing />);
    expect(screen.getByRole('banner')).not.toHaveClass('vy-panel');
  });
});

import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import {
  NoChatsIllustration,
  NoFriendsIllustration,
  NothingFoundIllustration,
  WelcomeIllustration,
} from '@/components/illustrations';
import { readEnv } from '@/lib/env';
import { renderWithProviders } from '@/test/utils';
import { ConfirmDialog } from './Dialog';
import { Toggle } from './Field';
import { EmptyState, ErrorState } from './States';

describe('state components', () => {
  it('EmptyState renders title, body and action', () => {
    renderWithProviders(
      <EmptyState title="Nothing yet" body="Follow people" action={<button>Go</button>} />,
    );
    expect(screen.getByRole('heading', { name: 'Nothing yet' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Go' })).toBeInTheDocument();
  });

  it('EmptyState: decorative art, a heading at the right level, two actions, extras below', () => {
    const { container } = renderWithProviders(
      <EmptyState
        illustration={<NoChatsIllustration />}
        title="No chats yet"
        body="Add a friend by their username, then say hi."
        headingLevel={2}
        action={<button type="button">Add a friend</button>}
        secondaryAction={<button type="button">New message</button>}
      >
        <p>Your handle</p>
      </EmptyState>,
    );
    const heading = screen.getByRole('heading', { level: 2, name: 'No chats yet' });
    expect(heading).toHaveClass('type-wide');
    const art = container.querySelector('svg[data-illustration="no-chats"]')!;
    expect(art).toHaveAttribute('aria-hidden', 'true');
    expect(art).toHaveAttribute('focusable', 'false');
    expect(screen.queryByRole('img')).toBeNull();
    const [primary, secondary] = screen.getAllByRole('button');
    expect(primary).toHaveTextContent('Add a friend');
    expect(secondary).toHaveTextContent('New message');
    expect(screen.getByText('Your handle')).toBeInTheDocument();
  });

  it('illustrations draw in theme colours only: no gradients, filters or fixed hexes', () => {
    const { container } = renderWithProviders(
      <>
        <WelcomeIllustration />
        <NoChatsIllustration />
        <NoFriendsIllustration />
        <NothingFoundIllustration />
      </>,
    );
    const svgs = container.querySelectorAll('svg[data-illustration]');
    expect(svgs).toHaveLength(4);
    const markup = container.innerHTML;
    expect(markup).not.toMatch(/Gradient|filter|feDropShadow|#[0-9a-f]{3,6}\b/i);
    for (const el of container.querySelectorAll('[stroke-width]')) {
      if (el.getAttribute('stroke') === 'currentColor')
        expect(el.getAttribute('stroke-width')).toBe('1.5');
    }
  });

  it('ErrorState shows a friendly message and retries', async () => {
    const retry = vi.fn();
    renderWithProviders(<ErrorState error={new TypeError('Failed to fetch')} onRetry={retry} />);
    expect(screen.getByRole('alert')).toHaveTextContent('offline');
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(retry).toHaveBeenCalled();
  });

  it('Toggle is a labelled switch that reports its state', async () => {
    const onChange = vi.fn();
    renderWithProviders(<Toggle checked={false} onChange={onChange} label="Read receipts" />);
    const sw = screen.getByRole('switch', { name: 'Read receipts' });
    expect(sw).toHaveAttribute('aria-checked', 'false');
    await userEvent.click(sw);
    expect(onChange).toHaveBeenCalledWith(true);
  });
});

describe('ConfirmDialog', () => {
  it('is an accessible modal that closes on Escape', async () => {
    const onClose = vi.fn();
    const onConfirm = vi.fn();
    renderWithProviders(
      <ConfirmDialog
        open
        onClose={onClose}
        onConfirm={onConfirm}
        title="Delete post?"
        confirmLabel="Delete"
        danger
      />,
    );
    const dialog = await screen.findByRole('dialog', { name: 'Delete post?' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    await userEvent.click(screen.getByRole('button', { name: 'Delete' }));
    expect(onConfirm).toHaveBeenCalled();
    await userEvent.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalled();
  });
});

describe('readEnv', () => {
  it('reports missing configuration clearly', () => {
    const r = readEnv({});
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.problems.join(' ')).toContain('VITE_SUPABASE_URL');
  });
  it('accepts valid configuration', () => {
    const r = readEnv({
      VITE_SUPABASE_URL: 'https://abc.supabase.co',
      VITE_SUPABASE_ANON_KEY: 'x'.repeat(40),
    });
    expect(r.ok).toBe(true);
  });
});

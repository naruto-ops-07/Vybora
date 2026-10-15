import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
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

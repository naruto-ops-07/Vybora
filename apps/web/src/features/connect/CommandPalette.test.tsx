import { screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '@/test/utils';
import { CommandPalette } from './CommandPalette';

vi.mock('@/features/auth/AuthProvider', () => ({ useMe: () => ({ userId: 'me' }) }));
vi.mock('./hooks', () => ({
  conversationTitle: () => 'Chat',
  useNicknames: () => ({ data: {} }),
  useSecureInbox: () => ({ data: [] }),
}));

describe('command palette', () => {
  it('lists the thread keyboard shortcuts as non-actionable items', () => {
    renderWithProviders(<CommandPalette open onOpenChange={vi.fn()} onNewChat={vi.fn()} />);
    const group = screen.getByRole('group', { name: 'Keyboard shortcuts' });
    const items = within(group).getAllByRole('option');
    expect(items.map((i) => i.textContent)).toEqual([
      'Move between messages↑ ↓',
      'Open the message menu (also Shift F10)Enter',
      'Reply to the focused messageR',
      'Select or deselect a message in select modeSpace',
      'Close or go backEsc',
      'New messageAlt N',
      'Chat detailsAlt I',
      'Previous or next chatAlt ↑ ↓',
      'Command menuCtrl/⌘ K',
    ]);
    items.forEach((i) => expect(i).toHaveAttribute('aria-disabled', 'true'));
  });
});

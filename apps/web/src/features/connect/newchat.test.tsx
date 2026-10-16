import type * as Api from '@vybora/api';
import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '@/test/utils';
import { NewChatDialog } from './NewChatDialog';

const api = vi.hoisted(() => ({
  fetchFriends: vi.fn(),
  searchProfiles: vi.fn(),
  createSecureConversation: vi.fn(),
}));
vi.mock('@vybora/api', async (orig) => ({ ...(await orig<typeof Api>()), ...api }));
vi.mock('@/lib/supabase', () => ({ supabase: {} }));

beforeEach(() => {
  Object.values(api).forEach((f) => f.mockReset());
  api.searchProfiles.mockResolvedValue([]);
  api.fetchFriends.mockResolvedValue([
    { userId: 'id-maya', username: 'maya', displayName: 'Maya', avatarPath: null, since: null },
    { userId: 'id-sam', username: 'sam', displayName: null, avatarPath: null, since: null },
  ]);
});

describe('new message: friends quick-pick', () => {
  it('lists friends while the search box is empty and picks them in one tap', async () => {
    renderWithProviders(<NewChatDialog open onClose={vi.fn()} />);
    const friends = await screen.findByRole('list', { name: 'Friends' });
    await userEvent.click(within(friends).getByRole('checkbox', { name: /maya/ }));
    expect(within(friends).getByRole('checkbox', { name: /maya/ })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    expect(screen.getByRole('button', { name: 'Message maya' })).toBeEnabled();
  });

  it('hides the quick-pick once the person starts searching', async () => {
    renderWithProviders(<NewChatDialog open onClose={vi.fn()} />);
    await screen.findByRole('list', { name: 'Friends' });
    await userEvent.type(screen.getByRole('textbox', { name: 'Search people' }), 'le');
    expect(screen.queryByRole('list', { name: 'Friends' })).toBeNull();
  });

  it('shows no friends section when there are none', async () => {
    api.fetchFriends.mockResolvedValue([]);
    renderWithProviders(<NewChatDialog open onClose={vi.fn()} />);
    await screen.findByRole('dialog');
    await waitFor(() => expect(api.fetchFriends).toHaveBeenCalled());
    await act(() => Promise.resolve());
    expect(screen.queryByRole('list', { name: 'Friends' })).toBeNull();
  });
});

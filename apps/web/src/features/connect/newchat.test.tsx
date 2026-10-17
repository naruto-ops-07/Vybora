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
  fetchSecureInbox: vi.fn(),
}));
vi.mock('@vybora/api', async (orig) => ({ ...(await orig<typeof Api>()), ...api }));
vi.mock('@/lib/supabase', () => ({ supabase: {} }));
vi.mock('@/features/auth/AuthProvider', () => ({ useMe: () => ({ userId: 'me' }) }));

beforeEach(() => {
  Object.values(api).forEach((f) => f.mockReset());
  api.searchProfiles.mockResolvedValue([]);
  api.fetchSecureInbox.mockResolvedValue([]);
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

const friend = (username: string, displayName: string | null = null) => ({
  userId: `id-${username}`,
  username,
  displayName,
  avatarPath: null,
  since: null,
});
const direct = (peer: string, lastMessageAt: string) => ({
  id: `c-${peer}`,
  kind: 'direct',
  lastMessageAt,
  members: [
    { id: 'me', username: 'me', display_name: '', avatar_path: null },
    { id: `id-${peer}`, username: peer, display_name: '', avatar_path: null },
  ],
});

describe('new message: quick-pick order and cap', () => {
  const names = ['zoe', 'yan', 'xia', 'wes', 'val', 'uma', 'tom', 'sid', 'rae', 'quin'];

  it('shows eight friends, recent chats first then by name, and can show all', async () => {
    api.fetchFriends.mockResolvedValue(names.map((n) => friend(n)));
    api.fetchSecureInbox.mockResolvedValue([
      direct('wes', '2026-10-17T09:00:00Z'),
      direct('zoe', '2026-10-17T10:00:00Z'),
    ]);
    renderWithProviders(<NewChatDialog open onClose={vi.fn()} />);
    const list = await screen.findByRole('list', { name: 'Friends' });
    await waitFor(() =>
      expect(
        within(list)
          .getAllByRole('checkbox')
          .map((c) => within(c).getByText(/^[a-z]+$/).textContent),
      ).toEqual(['zoe', 'wes', 'quin', 'rae', 'sid', 'tom', 'uma', 'val']),
    );
    await userEvent.click(screen.getByRole('button', { name: 'Show all friends (10)' }));
    expect(within(list).getAllByRole('checkbox')).toHaveLength(10);
    expect(screen.queryByRole('button', { name: /Show all friends/ })).toBeNull();
  });

  it('has no "Show all" with eight friends or fewer', async () => {
    api.fetchFriends.mockResolvedValue(names.slice(0, 8).map((n) => friend(n)));
    renderWithProviders(<NewChatDialog open onClose={vi.fn()} />);
    const list = await screen.findByRole('list', { name: 'Friends' });
    expect(within(list).getAllByRole('checkbox')).toHaveLength(8);
    expect(screen.queryByRole('button', { name: /Show all friends/ })).toBeNull();
  });
});

describe('new message: no results', () => {
  it('says no one by that name and offers to add them by username', async () => {
    renderWithProviders(<NewChatDialog open onClose={vi.fn()} />);
    await screen.findByRole('list', { name: 'Friends' });
    await userEvent.type(screen.getByRole('textbox', { name: 'Search people' }), 'kofi_m');
    expect(await screen.findByRole('heading', { name: 'No one by that name' })).toBeInTheDocument();
    expect(screen.getByText('Check the spelling, or add them by username.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add a friend' })).toBeInTheDocument();
  });
});

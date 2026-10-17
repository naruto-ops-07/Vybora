import type * as Api from '@vybora/api';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createRef } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetOnboardingMemory } from '@/features/onboarding/store';
import { renderWithProviders } from '@/test/utils';
import { InboxPane } from './InboxPane';

const api = vi.hoisted(() => ({
  fetchSecureInbox: vi.fn(),
  fetchNicknames: vi.fn(),
  fetchConnectPrivacy: vi.fn(),
  fetchFriends: vi.fn(),
  fetchFriendRequests: vi.fn(),
  watchPresence: vi.fn(),
}));
vi.mock('@vybora/api', async (orig) => ({ ...(await orig<typeof Api>()), ...api }));
vi.mock('@/lib/supabase', () => ({ supabase: {} }));
vi.mock('./ConnectProvider', () => ({ useConnect: () => ({ engine: null }) }));
vi.mock('@/features/auth/AuthProvider', () => {
  const profile = { id: 'me', username: 'maya', display_name: 'Maya', avatar_path: null };
  return {
    useMe: () => ({ userId: 'me', profile }),
    useAuth: () => ({ userId: 'me', profile }),
  };
});

beforeEach(() => {
  Object.values(api).forEach((f) => f.mockReset());
  api.fetchSecureInbox.mockResolvedValue([]);
  api.fetchNicknames.mockResolvedValue({});
  api.fetchConnectPrivacy.mockResolvedValue({ show_online: true });
  api.fetchFriends.mockResolvedValue([]);
  api.fetchFriendRequests.mockResolvedValue({ incoming: [], outgoing: [] });
  api.watchPresence.mockReturnValue(() => undefined);
});
afterEach(() => {
  localStorage.clear();
  resetOnboardingMemory();
});

const renderInbox = () =>
  renderWithProviders(
    <InboxPane composeSignal={0} onComposeHandled={vi.fn()} searchRef={createRef()} />,
  );

describe('chat list on first run', () => {
  it('shows Get started above the illustrated "No chats yet" with both actions', async () => {
    renderInbox();
    const panel = await screen.findByRole('region', { name: 'Get started' });
    expect(within(panel).getByText(/0 of 3/)).toBeInTheDocument();
    expect(within(panel).getByText('@maya')).toBeInTheDocument();
    const empty = screen.getByRole('heading', { level: 2, name: 'No chats yet' });
    expect(panel.compareDocumentPosition(empty) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByText('Add a friend by their username, then say hi.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Add a friend' })).toHaveAttribute('href', '/friends');
    await userEvent.click(screen.getAllByRole('button', { name: 'New message' }).at(-1)!);
    expect(await screen.findByRole('dialog', { name: 'New message' })).toBeInTheDocument();
  });

  it('moves focus to search after hiding Get started, and keeps it hidden', async () => {
    const searchRef = createRef<HTMLInputElement>();
    const { unmount } = renderWithProviders(
      <InboxPane composeSignal={0} onComposeHandled={vi.fn()} searchRef={searchRef} />,
    );
    await userEvent.click(await screen.findByRole('button', { name: 'Hide getting started' }));
    expect(screen.getByRole('textbox', { name: 'Search chats' })).toHaveFocus();
    unmount();
    renderInbox();
    await screen.findByRole('heading', { name: 'No chats yet' });
    expect(screen.queryByRole('region', { name: 'Get started' })).toBeNull();
  });

  it('a search with no match says so and offers to add that username', async () => {
    renderInbox();
    await screen.findByRole('heading', { name: 'No chats yet' });
    await userEvent.type(screen.getByRole('textbox', { name: 'Search chats' }), '@Kofi_M');
    expect(screen.getByRole('heading', { name: 'No one by that name' })).toBeInTheDocument();
    expect(screen.getByText('Check the spelling, or add them by username.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Add a friend' })).toHaveAttribute(
      'href',
      '/friends?add=kofi_m',
    );
    // Get started stays out of the way while searching.
    expect(screen.queryByRole('region', { name: 'Get started' })).toBeNull();
  });
});

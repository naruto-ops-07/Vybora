import type * as Api from '@vybora/api';
import type { Friend, FriendRequest, SecureConversation } from '@vybora/api';
import { qk } from '@vybora/api';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, renderHook, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '@/test/utils';
import { FriendRequestBadge } from './FriendRequestBadge';
import { useFriendRequests } from './hooks';
import { FriendsPane } from './FriendsPane';

const api = vi.hoisted(() => ({
  sendFriendRequest: vi.fn(),
  respondFriendRequest: vi.fn(),
  cancelFriendRequest: vi.fn(),
  removeFriend: vi.fn(),
  fetchFriends: vi.fn(),
  fetchFriendRequests: vi.fn(),
  createSecureConversation: vi.fn(),
  fetchConnectPrivacy: vi.fn(),
  fetchSecureInbox: vi.fn(),
  watchPresence: vi.fn(),
}));
vi.mock('@vybora/api', async (orig) => ({ ...(await orig<typeof Api>()), ...api }));
vi.mock('@/features/auth/AuthProvider', () => {
  const profile = { id: 'me', username: 'me_too', display_name: 'Me', avatar_path: null };
  return {
    useMe: () => ({ userId: 'me', profile }),
    useAuth: () => ({ userId: 'me', profile }),
  };
});
vi.mock('@/lib/supabase', () => ({ supabase: {} }));
vi.mock('@/features/connect/ConnectProvider', () => ({ useConnect: () => ({ engine: null }) }));

const person = (username: string, displayName: string | null = null) => ({
  userId: `id-${username}`,
  username,
  displayName,
  avatarPath: null,
});
const friend = (username: string, displayName: string | null = null): Friend => ({
  ...person(username, displayName),
  since: '2026-10-01T00:00:00Z',
});
const request = (username: string, displayName: string | null = null): FriendRequest => ({
  ...person(username, displayName),
  createdAt: '2026-10-16T09:00:00Z',
});
const never = () => new Promise<never>(() => undefined);
const directChat = (id: string, peerId: string) =>
  ({
    id,
    kind: 'direct',
    lastMessageAt: '2026-10-16T09:00:00Z',
    members: [
      { id: 'me', username: 'me_too', display_name: '', avatar_path: null },
      { id: peerId, username: peerId.slice(3), display_name: '', avatar_path: null },
    ],
  }) as unknown as SecureConversation;

function client() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
}

function renderPane(qc = client()) {
  return renderWithProviders(
    <Routes>
      <Route path="/friends" element={<FriendsPane />} />
      <Route path="/messages/:id" element={<p>Chat page</p>} />
    </Routes>,
    { route: '/friends', client: qc },
  );
}

beforeEach(() => {
  Object.values(api).forEach((f) => f.mockReset());
  api.fetchFriends.mockResolvedValue([]);
  api.fetchFriendRequests.mockResolvedValue({ incoming: [], outgoing: [] });
  api.fetchConnectPrivacy.mockResolvedValue({ show_online: true });
  api.fetchSecureInbox.mockResolvedValue([]);
  api.watchPresence.mockReturnValue(() => undefined);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('add a friend', () => {
  it('sends by username (case and @ insensitive), confirms inline and clears the field', async () => {
    api.sendFriendRequest.mockResolvedValue('sent');
    renderPane();
    const input = screen.getByRole('textbox', { name: 'Friend’s username' });
    await userEvent.type(input, '@Maya{Enter}');
    expect(api.sendFriendRequest).toHaveBeenCalledWith({}, 'maya');
    expect(await screen.findByRole('status')).toHaveTextContent('Request sent to @maya');
    expect(input).toHaveValue('');
  });

  it('cannot send an empty username', () => {
    renderPane();
    expect(screen.getByRole('button', { name: 'Send request' })).toBeDisabled();
  });

  it('keeps the text and marks the field invalid when no one has that username', async () => {
    api.sendFriendRequest.mockRejectedValue({ message: 'user_not_found', code: 'P0002' });
    renderPane();
    const input = screen.getByRole('textbox', { name: 'Friend’s username' });
    await userEvent.type(input, 'mayaa');
    await userEvent.click(screen.getByRole('button', { name: 'Send request' }));
    expect(await screen.findByRole('status')).toHaveTextContent('No one with that username');
    expect(input).toHaveValue('mayaa');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    // Typing again clears the old message.
    await userEvent.type(input, 'x');
    expect(screen.getByRole('status')).toBeEmptyDOMElement();
  });

  it('shows instant friendship when they had already asked, and refreshes both lists', async () => {
    api.sendFriendRequest.mockResolvedValue('accepted');
    renderPane();
    await waitFor(() => expect(api.fetchFriends).toHaveBeenCalledTimes(1));
    await userEvent.type(screen.getByRole('textbox', { name: 'Friend’s username' }), 'sam{Enter}');
    expect(await screen.findByRole('status')).toHaveTextContent('You and @sam are now friends');
    await waitFor(() => expect(api.fetchFriends).toHaveBeenCalledTimes(2));
  });

  it('focuses the field when opened from the command menu', async () => {
    renderWithProviders(
      <Routes>
        <Route path="/friends" element={<FriendsPane />} />
      </Routes>,
      { route: { pathname: '/friends', state: { focusAddFriend: true } } as never },
    );
    await waitFor(() =>
      expect(screen.getByRole('textbox', { name: 'Friend’s username' })).toHaveFocus(),
    );
  });
});

describe('add links (/friends?add=)', () => {
  function renderAt(route: string) {
    return renderWithProviders(
      <Routes>
        <Route path="/friends" element={<FriendsPane />} />
      </Routes>,
      { route },
    );
  }

  it('prefills the username and focuses the field, without sending', async () => {
    renderAt('/friends?add=%40Maya.Rose');
    const input = screen.getByRole('textbox', { name: 'Friend’s username' });
    await waitFor(() => expect(input).toHaveFocus());
    expect(input).toHaveValue('maya.rose');
    expect(screen.getByRole('button', { name: 'Send request' })).toBeEnabled();
    await act(() => new Promise((r) => setTimeout(r, 50)));
    expect(api.sendFriendRequest).not.toHaveBeenCalled();
  });

  it('ignores something that can’t be a username', async () => {
    renderAt('/friends?add=%3Cscript%3E');
    await screen.findByText('Your circle starts here');
    expect(screen.getByRole('textbox', { name: 'Friend’s username' })).toHaveValue('');
  });
});

describe('friend requests', () => {
  it('accepting removes the request at once and shows them as a friend', async () => {
    api.fetchFriendRequests.mockResolvedValue({ incoming: [request('sam', 'Sam')], outgoing: [] });
    api.respondFriendRequest.mockImplementation(never);
    renderPane();
    const requests = await screen.findByRole('list', { name: 'Requests' });
    await userEvent.click(
      within(requests).getByRole('button', { name: 'Accept request from Sam' }),
    );
    expect(api.respondFriendRequest).toHaveBeenCalledWith({}, 'id-sam', true);
    expect(screen.queryByRole('list', { name: 'Requests' })).not.toBeInTheDocument();
    const friends = screen.getByRole('list', { name: 'Friends' });
    expect(within(friends).getByText('Sam')).toBeInTheDocument();
  });

  it('keeps keyboard focus in the list when a request row goes away', async () => {
    api.fetchFriendRequests.mockResolvedValue({
      incoming: [request('sam', 'Sam'), request('lena', 'Lena')],
      outgoing: [],
    });
    api.respondFriendRequest.mockImplementation(never);
    renderPane();
    await userEvent.click(await screen.findByRole('button', { name: 'Accept request from Sam' }));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Accept request from Lena' })).toHaveFocus(),
    );
    await userEvent.click(screen.getByRole('button', { name: 'Decline request from Lena' }));
    await waitFor(() =>
      expect(screen.getByRole('heading', { level: 2, name: /^Friends/ })).toHaveFocus(),
    );
  });

  it('puts a declined request back and explains when the server fails', async () => {
    api.fetchFriendRequests.mockResolvedValue({ incoming: [request('sam', 'Sam')], outgoing: [] });
    let fail!: (e: unknown) => void;
    api.respondFriendRequest.mockImplementation(() => new Promise((_, reject) => (fail = reject)));
    renderPane();
    await userEvent.click(await screen.findByRole('button', { name: 'Decline request from Sam' }));
    expect(screen.queryByRole('button', { name: 'Decline request from Sam' })).toBeNull();
    // The background refresh must not race the rollback.
    api.fetchFriendRequests.mockImplementation(never);
    await act(async () => fail(new TypeError('Failed to fetch')));
    expect(await screen.findByRole('alert')).toHaveTextContent('Couldn’t decline Sam’s request');
    expect(screen.getByRole('button', { name: 'Decline request from Sam' })).toBeInTheDocument();
  });

  it('a request that is already gone is dropped quietly, not restored', async () => {
    api.fetchFriendRequests.mockResolvedValueOnce({
      incoming: [request('sam', 'Sam')],
      outgoing: [],
    });
    api.respondFriendRequest.mockRejectedValue({ message: 'request_not_found' });
    renderPane();
    await userEvent.click(await screen.findByRole('button', { name: 'Accept request from Sam' }));
    expect(await screen.findByText('That request is no longer available.')).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'Accept request from Sam' })).toBeNull(),
    );
    expect(screen.queryByText('Sam')).toBeNull();
  });

  it('cancels a sent request optimistically and restores it on failure', async () => {
    api.fetchFriendRequests.mockResolvedValue({ incoming: [], outgoing: [request('lena')] });
    let fail!: (e: unknown) => void;
    api.cancelFriendRequest.mockImplementation(() => new Promise((_, r) => (fail = r)));
    renderPane();
    const requests = await screen.findByRole('list', { name: 'Requests' });
    expect(within(requests).getByText(/Pending/)).toBeInTheDocument();
    await userEvent.click(within(requests).getByRole('button', { name: 'Cancel request to lena' }));
    expect(api.cancelFriendRequest).toHaveBeenCalledWith({}, 'id-lena');
    expect(screen.queryByRole('list', { name: 'Requests' })).toBeNull();
    api.fetchFriendRequests.mockImplementation(never);
    await act(async () => fail(new Error('boom')));
    expect(await screen.findByRole('alert')).toHaveTextContent('Couldn’t cancel');
    expect(screen.getByRole('button', { name: 'Cancel request to lena' })).toBeInTheDocument();
  });
});

describe('friends list', () => {
  it('shows the illustrated empty state with my handle, and no requests section', async () => {
    renderPane();
    expect(
      await screen.findByRole('heading', { level: 3, name: 'Your circle starts here' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Share your username or add someone by theirs.')).toBeInTheDocument();
    expect(document.querySelector('svg[data-illustration="no-friends"]')).toHaveAttribute(
      'aria-hidden',
      'true',
    );
    expect(screen.getByText('@me_too')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Copy @me_too' })).toBeInTheDocument();
    expect(screen.queryByRole('list', { name: 'Requests' })).toBeNull();
  });

  it('names each list once: no region repeats the list’s name', async () => {
    api.fetchFriends.mockResolvedValue([friend('maya', 'Maya')]);
    api.fetchFriendRequests.mockResolvedValue({ incoming: [request('sam', 'Sam')], outgoing: [] });
    renderPane();
    await screen.findByRole('list', { name: 'Friends' });
    expect(screen.getByRole('list', { name: 'Requests' })).toBeInTheDocument();
    expect(screen.queryAllByRole('region')).toHaveLength(0);
  });

  it('reads request times in full to screen readers', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true, now: new Date('2026-10-16T12:00:00Z') });
    api.fetchFriendRequests.mockResolvedValue({ incoming: [request('sam', 'Sam')], outgoing: [] });
    renderPane();
    const requests = await screen.findByRole('list', { name: 'Requests' });
    expect(within(requests).getByText('3h')).toHaveAttribute('aria-hidden', 'true');
    expect(within(requests).getByText('3 hours ago')).toHaveClass('sr-only');
  });

  it('lists friends with a count, @username and an online dot', async () => {
    api.fetchFriends.mockResolvedValue([friend('maya', 'Maya'), friend('sam')]);
    api.fetchSecureInbox.mockResolvedValue([directChat('c-maya', 'id-maya')]);
    api.watchPresence.mockImplementation(
      (_c: unknown, _ids: string[], cb: (s: Set<string>) => void) => {
        cb(new Set(['id-maya']));
        return () => undefined;
      },
    );
    renderPane();
    expect(await screen.findByRole('heading', { name: /^Friends\s*2$/ })).toBeInTheDocument();
    const list = screen.getByRole('list', { name: 'Friends' });
    expect(within(list).getByText('@maya')).toBeInTheDocument();
    await waitFor(() =>
      expect(within(list).getAllByRole('img', { name: 'Online' })).toHaveLength(1),
    );
    // Presence is only shared between people with a chat: sam has none, so isn't watched.
    expect(api.watchPresence.mock.calls[0]![1]).toEqual(['id-maya']);
  });

  it('shows no one online while my own online status is off', async () => {
    api.fetchConnectPrivacy.mockResolvedValue({ show_online: false });
    api.fetchFriends.mockResolvedValue([friend('maya', 'Maya')]);
    renderPane();
    await screen.findByText('Maya');
    expect(api.watchPresence).not.toHaveBeenCalled();
  });

  it('offers a retry when friends fail to load', async () => {
    api.fetchFriends.mockRejectedValueOnce(new Error('boom'));
    renderPane();
    const retry = await screen.findByRole('button', { name: 'Try again' });
    expect(retry).toHaveClass('touch-target');
    await userEvent.click(retry);
    expect(await screen.findByText('Your circle starts here')).toBeInTheDocument();
  });

  it('removes a friend only after confirming', async () => {
    api.fetchFriends.mockResolvedValue([friend('maya', 'Maya')]);
    api.removeFriend.mockResolvedValue(undefined);
    renderPane();
    await userEvent.click(await screen.findByRole('button', { name: 'More actions for Maya' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Remove friend' }));
    const dialog = await screen.findByRole('dialog', { name: 'Remove Maya from friends?' });
    expect(api.removeFriend).not.toHaveBeenCalled();
    api.fetchFriends.mockResolvedValue([]);
    await userEvent.click(within(dialog).getByRole('button', { name: 'Remove friend' }));
    expect(api.removeFriend).toHaveBeenCalledWith({}, 'id-maya');
    expect(await screen.findByText('Your circle starts here')).toBeInTheDocument();
  });

  it('opens the existing direct chat with a friend', async () => {
    api.fetchFriends.mockResolvedValue([friend('maya', 'Maya')]);
    const conv = {
      id: 'c-maya',
      kind: 'direct',
      members: [
        { id: 'me', username: 'me' },
        { id: 'id-maya', username: 'maya' },
      ],
    } as unknown as SecureConversation;
    api.fetchSecureInbox.mockResolvedValue([conv]);
    const qc = client();
    qc.setQueryData(qk.connect.inbox, [conv]);
    renderPane(qc);
    await userEvent.click(await screen.findByRole('button', { name: 'Message Maya' }));
    expect(await screen.findByText('Chat page')).toBeInTheDocument();
    expect(api.createSecureConversation).not.toHaveBeenCalled();
  });

  it('starts a direct chat when there is none yet', async () => {
    api.fetchFriends.mockResolvedValue([friend('maya', 'Maya')]);
    api.createSecureConversation.mockResolvedValue('c-new');
    renderPane();
    await userEvent.click(await screen.findByRole('button', { name: 'Message Maya' }));
    expect(await screen.findByText('Chat page')).toBeInTheDocument();
    expect(api.createSecureConversation).toHaveBeenCalledWith({}, 'direct', ['id-maya']);
  });

  it('explains when a friend cannot be messaged', async () => {
    api.fetchFriends.mockResolvedValue([friend('maya', 'Maya')]);
    api.createSecureConversation.mockRejectedValue({ message: 'cannot_message' });
    renderPane();
    await userEvent.click(await screen.findByRole('button', { name: 'Message Maya' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('You can’t message Maya right now.');
  });

  it('opens the same actions on right-click', async () => {
    api.fetchFriends.mockResolvedValue([friend('maya', 'Maya')]);
    renderPane();
    fireEvent.contextMenu(await screen.findByText('Maya'));
    expect(await screen.findByRole('menuitem', { name: 'Message' })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Remove friend' })).toBeInTheDocument();
  });
});

describe('friend request badge', () => {
  it('shows nothing without incoming requests', () => {
    renderWithProviders(<FriendRequestBadge count={0} />);
    expect(screen.queryByText(/friend request/)).toBeNull();
    expect(screen.queryByText('0')).toBeNull();
  });

  it('shows the count visually and a full sentence to screen readers', () => {
    renderWithProviders(<FriendRequestBadge count={3} />);
    expect(screen.getByText('3')).toHaveAttribute('aria-hidden', 'true');
    expect(screen.getByText(/^, 3 friend requests$/)).toHaveClass('sr-only');
  });

  it('caps the visible count at 99+', () => {
    renderWithProviders(<FriendRequestBadge count={140} />);
    expect(screen.getByText('99+')).toBeInTheDocument();
    expect(screen.getByText(/140 friend requests/)).toBeInTheDocument();
  });

  it('polls incoming requests every 30 seconds', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const qc = client();
    const { result } = renderHook(() => useFriendRequests(), {
      wrapper: ({ children }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>,
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(api.fetchFriendRequests).toHaveBeenCalledTimes(1);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000);
    });
    expect(api.fetchFriendRequests).toHaveBeenCalledTimes(2);
  });
});

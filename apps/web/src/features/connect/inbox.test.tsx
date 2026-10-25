import type * as Api from '@vybora/api';
import type { Friend, FriendRequest } from '@vybora/api';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createRef } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetOnboardingMemory } from '@/features/onboarding/store';
import { renderWithProviders } from '@/test/utils';
import { InboxPane } from './InboxPane';
import { takeThreadIntent } from './threadIntents';

const api = vi.hoisted(() => ({
  fetchSecureInbox: vi.fn(),
  fetchNicknames: vi.fn(),
  fetchConnectPrivacy: vi.fn(),
  fetchFriends: vi.fn(),
  fetchFriendRequests: vi.fn(),
  createSecureConversation: vi.fn(),
  watchPresence: vi.fn(),
}));
vi.mock('@vybora/api', async (orig) => ({ ...(await orig<typeof Api>()), ...api }));
// A Supabase stand-in: realtime channels are joined once an engine exists.
vi.mock('@/lib/supabase', () => ({
  supabase: {
    channel: () => ({
      on: () => ({ subscribe: () => undefined }),
      subscribe: () => undefined,
      unsubscribe: () => undefined,
      send: () => undefined,
      track: () => undefined,
      presenceState: () => ({}),
    }),
    removeChannel: () => undefined,
  },
}));
const fakeEngine = vi.hoisted(() => ({
  current: null as null | {
    queryMessages: (o?: unknown) => Promise<unknown[]>;
    listMessages: () => Promise<unknown[]>;
    listStarred: () => Promise<unknown[]>;
    onChange: (fn: () => void) => () => void;
  },
}));
vi.mock('./ConnectProvider', () => ({ useConnect: () => ({ engine: fakeEngine.current }) }));
vi.mock('@/features/auth/AuthProvider', () => {
  const profile = { id: 'me', username: 'maya', display_name: 'Maya', avatar_path: null };
  return {
    useMe: () => ({ userId: 'me', profile }),
    useAuth: () => ({ userId: 'me', profile }),
  };
});

const friend = (username: string, displayName: string | null = null): Friend => ({
  userId: `id-${username}`,
  username,
  displayName,
  avatarPath: null,
  since: '2026-10-01T00:00:00Z',
});
const request = (username: string): FriendRequest => ({
  userId: `id-${username}`,
  username,
  displayName: null,
  avatarPath: null,
  createdAt: '2026-10-16T09:00:00Z',
});

beforeEach(() => {
  Object.defineProperty(navigator, 'clipboard', {
    value: { writeText: vi.fn().mockResolvedValue(undefined) },
    configurable: true,
  });
  Object.values(api).forEach((f) => f.mockReset());
  api.fetchSecureInbox.mockResolvedValue([]);
  api.fetchNicknames.mockResolvedValue({});
  api.fetchConnectPrivacy.mockResolvedValue({ show_online: true });
  api.fetchFriends.mockResolvedValue([]);
  api.fetchFriendRequests.mockResolvedValue({ incoming: [], outgoing: [] });
  api.watchPresence.mockReturnValue(() => undefined);
});
afterEach(() => {
  fakeEngine.current = null;
  localStorage.clear();
  resetOnboardingMemory();
});

const renderInbox = () =>
  renderWithProviders(
    <InboxPane composeSignal={0} onComposeHandled={vi.fn()} searchRef={createRef()} />,
  );

describe('chat list on first run', () => {
  it('a fresh account: Get started above “No friends yet”, with Find friends and Share', async () => {
    renderInbox();
    const panel = await screen.findByRole('region', { name: 'Get started' });
    expect(within(panel).getByText(/0 of 3/)).toBeInTheDocument();
    expect(within(panel).getByText('@maya')).toBeInTheDocument();
    const empty = screen.getByRole('heading', { level: 2, name: 'No friends yet' });
    expect(panel.compareDocumentPosition(empty) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(
      screen.getByText('Find your friends by their username and start chatting.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Find friends' })).toHaveAttribute('href', '/friends');
    const share = screen.getByRole('button', { name: 'Share your username' });
    await userEvent.click(share);
    expect(await screen.findByText('Link to add you copied')).toBeInTheDocument();
  });

  it('with requests out, says how many it’s waiting on', async () => {
    api.fetchFriendRequests.mockResolvedValue({
      incoming: [],
      outgoing: [request('sam'), request('lena')],
    });
    renderInbox();
    expect(
      await screen.findByText('Waiting on 2 requests. Find more friends while you wait.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: 'No friends yet' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Find friends' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Share your username' })).toBeNull();
  });

  it('with friends, offers them as one-tap avatars, then New message', async () => {
    api.fetchFriends.mockResolvedValue([friend('maya_k', 'Maya K'), friend('sam')]);
    api.createSecureConversation.mockResolvedValue('c-new');
    renderInbox();
    expect(await screen.findByText('Say hi to a friend.')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: 'No chats yet' })).toBeInTheDocument();
    const hi = screen.getByRole('button', { name: 'Say hi to Maya K' });
    expect(screen.getByRole('button', { name: 'Say hi to sam' })).toBeInTheDocument();
    expect(screen.queryByText('No friends yet')).toBeNull();
    await userEvent.click(hi);
    expect(api.createSecureConversation).toHaveBeenCalledWith(expect.anything(), 'direct', [
      'id-maya_k',
    ]);
    await userEvent.click(screen.getAllByRole('button', { name: 'New message' }).at(-1)!);
    expect(await screen.findByRole('dialog', { name: 'New message' })).toBeInTheDocument();
  });

  it('shows at most five friends', async () => {
    api.fetchFriends.mockResolvedValue(
      ['a1', 'b2', 'c3', 'd4', 'e5', 'f6', 'g7'].map((u) => friend(u)),
    );
    renderInbox();
    await screen.findByText('Say hi to a friend.');
    expect(screen.getAllByRole('button', { name: /^Say hi to / })).toHaveLength(5);
  });

  it('stays neutral while friends load: no “No friends yet” flash', async () => {
    api.fetchFriends.mockImplementation(() => new Promise(() => undefined));
    renderInbox();
    await waitFor(() => expect(api.fetchSecureInbox).toHaveBeenCalled());
    await screen.findByRole('textbox', { name: 'Search chats' });
    await new Promise((r) => setTimeout(r, 20));
    for (const text of [
      'No friends yet',
      'No chats yet',
      'Say hi to a friend.',
      'Find your friends by their username and start chatting.',
    ])
      expect(screen.queryByText(text)).toBeNull();
    expect(screen.queryByText(/^Waiting on/)).toBeNull();
  });

  it('when friends fail to load, shows the say-hi copy without avatars', async () => {
    api.fetchFriends.mockRejectedValue(new Error('offline'));
    renderInbox();
    expect(await screen.findByText('Say hi to a friend.')).toBeInTheDocument();
    expect(screen.queryAllByRole('button', { name: /^Say hi to / })).toHaveLength(0);
    expect(screen.queryByText('No friends yet')).toBeNull();
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
    await screen.findByRole('heading', { name: 'No friends yet' });
    expect(screen.queryByRole('region', { name: 'Get started' })).toBeNull();
  });

  it('a search with no match says so and offers to add that username', async () => {
    renderInbox();
    await screen.findByRole('heading', { name: 'No friends yet' });
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

describe('filter chips at a phone width', () => {
  it('fade at the end edge and keep end room, so the row reads as scrollable', async () => {
    const { ChatListHeader } = await import('./InboxPane');
    const { TooltipProvider } = await import('@/components/ui/Tooltip');
    renderWithProviders(
      <TooltipProvider>
        <ChatListHeader
          term=""
          onTerm={() => {}}
          filter="all"
          onFilter={() => {}}
          onCompose={() => {}}
        />
      </TooltipProvider>,
    );
    const row = screen.getByRole('tablist', { name: 'Filter chats' });
    expect(row.className).toContain('overflow-x-auto');
    expect(row.className).toMatch(
      /mask-image:linear-gradient\(to_right,#000_calc\(100%-32px\),transparent\)/,
    );
    const end = row.lastElementChild!;
    expect(end).toHaveAttribute('data-filter-end');
    expect(end).toHaveAttribute('aria-hidden', 'true');
    expect(within(row).getAllByRole('tab')).toHaveLength(5);
  });
});

describe('starred messages from the chat list', () => {
  it('opens the all-chats starred view from the header', async () => {
    const { ChatListHeader } = await import('./InboxPane');
    const { TooltipProvider } = await import('@/components/ui/Tooltip');
    const onStarred = vi.fn();
    renderWithProviders(
      <TooltipProvider>
        <ChatListHeader
          term=""
          onTerm={() => {}}
          filter="all"
          onFilter={() => {}}
          onCompose={() => {}}
          onStarred={onStarred}
        />
      </TooltipProvider>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Starred messages' }));
    expect(onStarred).toHaveBeenCalled();
  });
});

describe('searching messages across chats', () => {
  const conv = (id: string, title: string, lastReadSeq = 9) => ({
    id,
    kind: 'group' as const,
    title,
    members: [
      { id: 'me', username: 'maya', display_name: 'Maya', avatar_path: null, role: 'member' },
      { id: 'leo', username: 'leo', display_name: 'Leo', avatar_path: null, role: 'member' },
    ],
    lastMessageAt: '2026-10-22T10:00:00Z',
    lastSeq: 9,
    lastReadSeq,
    unreadCount: 0,
    pinned: false,
    archived: false,
    muted: false,
    mutedUntil: null,
    notificationsEnabled: true,
    tone: 'default',
    theme: {},
    localTheme: null,
    useLocalTheme: false,
    clearedBeforeSeq: 0,
    disappearingSeconds: null,
    settingsPolicy: 'everyone',
    myRole: 'member',
    epoch: 1,
    themeVersion: 0,
    themeUpdatedBy: null,
    avatarPath: null,
  });
  const message = (over: Record<string, unknown>) => ({
    id: 'x1',
    conversationId: 'c1',
    seq: 4,
    senderId: 'leo',
    senderDeviceId: null,
    createdAt: '2026-10-22T09:00:00Z',
    expiresAt: null,
    status: 'received',
    kind: 'text',
    reactions: {},
    ...over,
  });

  it('lists matching messages under the chats and opens the one picked', async () => {
    api.fetchSecureInbox.mockResolvedValue([conv('c1', 'Weekend crew')]);
    fakeEngine.current = {
      queryMessages: vi.fn(async () => [message({ body: 'The cafe on the corner' })]),
      listMessages: vi.fn(async () => []),
      listStarred: vi.fn(async () => []),
      onChange: vi.fn(() => () => undefined),
    };
    renderInbox();
    await userEvent.type(screen.getByRole('textbox', { name: 'Search chats' }), 'cafe');
    const list = await screen.findByRole('list', { name: 'Messages' });
    expect(within(list).getByText('cafe', { selector: 'mark' })).toBeInTheDocument();
    expect(within(list).getByText(/Leo in Weekend crew/)).toBeInTheDocument();
    await userEvent.click(within(list).getAllByRole('button')[0]!);
    expect(takeThreadIntent('c1')).toEqual({ jumpTo: 'x1' });
  });

  it('marks a chat where an unread message mentions me', async () => {
    api.fetchSecureInbox.mockResolvedValue([conv('c1', 'Weekend crew', 3)]);
    fakeEngine.current = {
      queryMessages: vi.fn(async () => [message({ seq: 4, mentions: ['me'] })]),
      listMessages: vi.fn(async () => []),
      listStarred: vi.fn(async () => []),
      onChange: vi.fn(() => () => undefined),
    };
    renderInbox();
    expect(await screen.findByLabelText('You were mentioned')).toBeInTheDocument();
  });

  it('does not mark a mention I have already read', async () => {
    api.fetchSecureInbox.mockResolvedValue([conv('c1', 'Weekend crew', 9)]);
    fakeEngine.current = {
      queryMessages: vi.fn(async () => [message({ seq: 4, mentions: ['me'] })]),
      listMessages: vi.fn(async () => []),
      listStarred: vi.fn(async () => []),
      onChange: vi.fn(() => () => undefined),
    };
    renderInbox();
    await screen.findByText('Weekend crew');
    expect(screen.queryByLabelText('You were mentioned')).toBeNull();
  });
});

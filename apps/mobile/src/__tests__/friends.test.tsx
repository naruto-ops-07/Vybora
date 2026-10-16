import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  act,
  cleanup,
  fireEvent,
  render,
  renderHook,
  screen,
  waitFor,
} from '@testing-library/react-native';
import * as Haptics from 'expo-haptics';
import { qk, type Friend, type FriendRequest, type SecureConversation } from '@vybora/api';
import type { ReactNode } from 'react';
import { Alert } from 'react-native';
import FriendsScreen from '@/app/messages/friends';
import NewChat from '@/app/messages/new';
import { AddFriendForm } from '@/features/friends/AddFriendForm';
import { FriendRow } from '@/features/friends/FriendRow';
import { FriendsButton } from '@/features/friends/FriendsButton';
import { useOnlinePeers } from '@/features/connect/hooks';
import { useFriendActions, useFriendRequests, useMessageFriend } from '@/features/friends/hooks';
import { RequestRow } from '@/features/friends/RequestRow';

const mockRespond = jest.fn();
const mockCancel = jest.fn();
const mockRemove = jest.fn();
const mockCreate = jest.fn();
const mockPush = jest.fn();
const mockFetchRequests = jest.fn();
const mockFetchFriends = jest.fn();
const mockFetchInbox = jest.fn();
const mockSend = jest.fn();
const mockSearch = jest.fn();
const mockPrivacy = jest.fn();
const mockWatch = jest.fn();

jest.mock('@vybora/api', () => ({
  ...jest.requireActual('@vybora/api'),
  respondFriendRequest: (...a: unknown[]) => mockRespond(...a),
  cancelFriendRequest: (...a: unknown[]) => mockCancel(...a),
  removeFriend: (...a: unknown[]) => mockRemove(...a),
  createSecureConversation: (...a: unknown[]) => mockCreate(...a),
  fetchFriendRequests: (...a: unknown[]) => mockFetchRequests(...a),
  fetchFriends: (...a: unknown[]) => mockFetchFriends(...a),
  fetchSecureInbox: (...a: unknown[]) => mockFetchInbox(...a),
  sendFriendRequest: (...a: unknown[]) => mockSend(...a),
  searchProfiles: (...a: unknown[]) => mockSearch(...a),
  fetchConnectPrivacy: (...a: unknown[]) => mockPrivacy(...a),
  watchPresence: (...a: unknown[]) => mockWatch(...a),
}));
jest.mock('@/features/connect/ConnectProvider', () => ({ useConnect: () => ({ engine: null }) }));
jest.mock('@/lib/supabase', () => ({
  supabase: {},
  supabaseConfig: { url: 'http://x', anonKey: 'k' },
}));
jest.mock('@/features/auth/AuthProvider', () => ({ useMe: () => ({ userId: 'me' }) }));
jest.mock('expo-router', () => {
  const Stack = () => null;
  Stack.Screen = () => null;
  return {
    router: { push: (...a: unknown[]) => mockPush(...a) },
    Stack,
    useIsFocused: () => true,
  };
});
jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(() => Promise.resolve()),
  selectionAsync: jest.fn(() => Promise.resolve()),
  ImpactFeedbackStyle: { Light: 'light', Medium: 'medium' },
}));

const maya: Friend = {
  userId: 'u-maya',
  username: 'maya',
  displayName: 'Maya Rose',
  avatarPath: null,
  since: '2026-10-01T00:00:00Z',
};
const sam: Friend = { ...maya, userId: 'u-sam', username: 'sam', displayName: null };
const askMaya: FriendRequest = {
  userId: 'u-maya',
  username: 'maya',
  displayName: 'Maya Rose',
  avatarPath: null,
  createdAt: '2026-10-15T00:00:00Z',
};

const clients: QueryClient[] = [];
function newClient() {
  // Infinite mutation gc: QueryClient.clear() leaves mutation gc timers running,
  // which would hold the Jest worker open for five minutes.
  const c = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { gcTime: Infinity } },
  });
  clients.push(c);
  return c;
}
const wrapper = (client: QueryClient) =>
  function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };

let alert: jest.SpyInstance;
beforeEach(() => {
  jest.clearAllMocks();
  alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
});
afterEach(async () => {
  await cleanup();
  clients.splice(0).forEach((c) => c.clear());
  alert.mockRestore();
});

describe('FriendRow', () => {
  const setup = async (props: Partial<Parameters<typeof FriendRow>[0]> = {}) => {
    const onMessage = jest.fn();
    const onRemove = jest.fn();
    const ui = await render(
      <FriendRow friend={maya} onMessage={onMessage} onRemove={onRemove} {...props} />,
    );
    return { ui, onMessage, onRemove };
  };

  it('shows the name, @username and a labelled Message button', async () => {
    const { onMessage } = await setup();
    await waitFor(() => expect(screen.getByText('Maya Rose')).toBeTruthy());
    expect(screen.getByText('@maya')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Message Maya Rose' }));
    expect(onMessage).toHaveBeenCalledWith(maya);
  });

  it('falls back to @username when there is no display name', async () => {
    await setup({ friend: sam });
    await waitFor(() => expect(screen.getByRole('button', { name: 'Message sam' })).toBeTruthy());
  });

  it('only shows a presence dot when online', async () => {
    const { ui } = await setup();
    expect(screen.queryByTestId('presence-dot')).toBeNull();
    await ui.rerender(
      <FriendRow friend={maya} online onMessage={jest.fn()} onRemove={jest.fn()} />,
    );
    expect(screen.getByTestId('presence-dot')).toBeTruthy();
    expect(screen.getByLabelText(/Maya Rose, @maya, online/)).toBeTruthy();
  });

  it('asks before removing on long press', async () => {
    const { onRemove } = await setup();
    await fireEvent(screen.getByLabelText('Maya Rose, @maya'), 'longPress');
    expect(alert).toHaveBeenCalledTimes(1);
    const [title, , buttons] = alert.mock.calls[0]!;
    expect(title).toBe('Remove Maya Rose from friends?');
    expect(onRemove).not.toHaveBeenCalled();
    const remove = (buttons as { text: string; style?: string; onPress?: () => void }[]).find(
      (b) => b.style === 'destructive',
    )!;
    expect(remove.text).toBe('Remove friend');
    remove.onPress!();
    expect(onRemove).toHaveBeenCalledWith(maya);
  });

  it('exposes Message and Remove friend as screen-reader actions', async () => {
    const { onMessage, onRemove } = await setup();
    const row = screen.getByLabelText('Maya Rose, @maya');
    expect(row.props.accessibilityActions).toEqual([
      { name: 'message', label: 'Message' },
      { name: 'remove', label: 'Remove friend' },
    ]);
    await fireEvent(row, 'accessibilityAction', { nativeEvent: { actionName: 'message' } });
    expect(onMessage).toHaveBeenCalledWith(maya);
    await fireEvent(row, 'accessibilityAction', { nativeEvent: { actionName: 'remove' } });
    expect(alert).toHaveBeenCalled();
    alert.mock.calls[0]![2].find((b: { style?: string }) => b.style === 'destructive').onPress();
    expect(onRemove).toHaveBeenCalledWith(maya);
  });

  it('does not fire Message again while it is opening', async () => {
    const { onMessage } = await setup({ busy: true });
    await fireEvent.press(screen.getByRole('button', { name: 'Message Maya Rose' }));
    expect(onMessage).not.toHaveBeenCalled();
  });
});

describe('RequestRow', () => {
  it('lets you accept or decline an incoming request', async () => {
    const onAccept = jest.fn();
    const onDecline = jest.fn();
    await render(
      <RequestRow
        direction="incoming"
        request={askMaya}
        when="1d"
        onAccept={onAccept}
        onDecline={onDecline}
      />,
    );
    expect(screen.getByText('@maya')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Accept request from Maya Rose' }));
    expect(onAccept).toHaveBeenCalledWith(askMaya);
    await fireEvent.press(screen.getByRole('button', { name: 'Decline request from Maya Rose' }));
    expect(onDecline).toHaveBeenCalledWith(askMaya);
  });

  it('shows outgoing requests as pending with a Cancel button', async () => {
    const onCancel = jest.fn();
    await render(<RequestRow direction="outgoing" request={askMaya} onCancel={onCancel} />);
    expect(screen.getByText(/Pending/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Accept/ })).toBeNull();
    await fireEvent.press(screen.getByRole('button', { name: 'Cancel request to Maya Rose' }));
    expect(onCancel).toHaveBeenCalledWith(askMaya);
  });
});

describe('AddFriendForm', () => {
  const field = () => screen.getByLabelText('Friend’s username');
  const send = () => screen.getByRole('button', { name: 'Send request' });

  it('is set up for typing usernames', async () => {
    await render(<AddFriendForm onSubmit={jest.fn()} />);
    expect(field().props).toMatchObject({
      autoCapitalize: 'none',
      autoCorrect: false,
      spellCheck: false,
    });
    expect(screen.getByText('@')).toBeTruthy();
  });

  it('cannot send an empty username', async () => {
    const onSubmit = jest.fn();
    await render(<AddFriendForm onSubmit={onSubmit} />);
    await fireEvent.press(send());
    await fireEvent.changeText(field(), '  @ ');
    await fireEvent.press(send());
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('normalises the username, reports success and clears the field', async () => {
    const onSubmit = jest.fn().mockResolvedValue('sent');
    await render(<AddFriendForm onSubmit={onSubmit} />);
    await fireEvent.changeText(field(), '  @Maya.Rose ');
    await fireEvent.press(send());
    expect(onSubmit).toHaveBeenCalledWith('maya.rose');
    await waitFor(() => expect(screen.getByText('Request sent to @maya.rose')).toBeTruthy());
    expect(field().props.value).toBe('');
  });

  it.each([
    ['accepted', 'You and @maya are now friends'],
    ['already_friends', 'You’re already friends with @maya'],
    ['already_sent', 'You already sent @maya a request. It’s still pending.'],
  ] as const)('explains the %s outcome', async (result, text) => {
    await render(<AddFriendForm onSubmit={jest.fn().mockResolvedValue(result)} />);
    await fireEvent.changeText(field(), 'maya');
    await fireEvent.press(send());
    await waitFor(() => expect(screen.getByText(text)).toBeTruthy());
  });

  it.each([
    ['sent', 1],
    ['accepted', 1],
    ['already_friends', 0],
    ['already_sent', 0],
  ] as const)('gives a success haptic only for a real change (%s)', async (result, taps) => {
    await render(<AddFriendForm onSubmit={jest.fn().mockResolvedValue(result)} />);
    await fireEvent.changeText(field(), 'maya');
    await fireEvent.press(send());
    await waitFor(() => expect(field().props.value).toBe(''));
    expect(Haptics.impactAsync).toHaveBeenCalledTimes(taps);
  });

  it('gives no haptic when the request fails', async () => {
    await render(
      <AddFriendForm onSubmit={jest.fn().mockRejectedValue({ message: 'user_not_found' })} />,
    );
    await fireEvent.changeText(field(), 'ghost');
    await fireEvent.press(send());
    await waitFor(() => expect(screen.getByText(/No one with that username/)).toBeTruthy());
    expect(Haptics.impactAsync).not.toHaveBeenCalled();
  });

  it('shows one message for unknown, inactive and blocked usernames and keeps the text', async () => {
    await render(
      <AddFriendForm onSubmit={jest.fn().mockRejectedValue({ message: 'user_not_found' })} />,
    );
    await fireEvent.changeText(field(), 'ghost');
    await fireEvent.press(send());
    await waitFor(() =>
      expect(
        screen.getByText('No one with that username. Check the spelling and try again.'),
      ).toBeTruthy(),
    );
    expect(field().props.value).toBe('ghost');
  });

  it('clears the message when you start typing again', async () => {
    await render(
      <AddFriendForm onSubmit={jest.fn().mockRejectedValue({ message: 'cannot_add_self' })} />,
    );
    await fireEvent.changeText(field(), 'me');
    await fireEvent.press(send());
    await waitFor(() => expect(screen.getByText(/your own username/)).toBeTruthy());
    await fireEvent.changeText(field(), 'mex');
    expect(screen.queryByText(/your own username/)).toBeNull();
  });

  it('blocks a second send while the first is in flight', async () => {
    let resolve!: (r: 'sent') => void;
    const onSubmit = jest.fn(() => new Promise<'sent'>((r) => (resolve = r)));
    await render(<AddFriendForm onSubmit={onSubmit} />);
    await fireEvent.changeText(field(), 'maya');
    await fireEvent.press(send());
    await fireEvent.press(send());
    expect(onSubmit).toHaveBeenCalledTimes(1);
    await act(async () => resolve('sent'));
  });
});

describe('FriendsButton', () => {
  it('is just "Friends" with no requests', async () => {
    await render(<FriendsButton count={0} onPress={jest.fn()} />);
    expect(screen.getByRole('button', { name: 'Friends' })).toBeTruthy();
  });

  it('shows the count and says it in the label', async () => {
    const onPress = jest.fn();
    await render(<FriendsButton count={3} onPress={onPress} />);
    const button = screen.getByRole('button', { name: 'Friends, 3 friend requests' });
    // The digits are decorative (hidden from screen readers, who hear the label).
    expect(screen.getByText('3', { includeHiddenElements: true })).toBeTruthy();
    await fireEvent.press(button);
    expect(onPress).toHaveBeenCalled();
  });

  it('singular and capped', async () => {
    const { rerender } = await render(<FriendsButton count={1} onPress={jest.fn()} />);
    expect(screen.getByRole('button', { name: 'Friends, 1 friend request' })).toBeTruthy();
    await rerender(<FriendsButton count={140} onPress={jest.fn()} />);
    expect(screen.getByText('99+', { includeHiddenElements: true })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Friends, 140 friend requests' })).toBeTruthy();
  });
});

describe('useFriendActions', () => {
  const seed = (qc: QueryClient) => {
    qc.setQueryData(qk.connect.friendRequests, { incoming: [askMaya], outgoing: [] });
    qc.setQueryData(qk.connect.friends, [sam]);
  };
  const requests = (qc: QueryClient) =>
    qc.getQueryData<{ incoming: FriendRequest[]; outgoing: FriendRequest[] }>(
      qk.connect.friendRequests,
    )!;
  const friends = (qc: QueryClient) => qc.getQueryData<Friend[]>(qk.connect.friends)!;

  it('accepting moves the person into friends at once', async () => {
    const qc = newClient();
    seed(qc);
    let release!: () => void;
    mockRespond.mockReturnValue(new Promise<void>((r) => (release = r)));
    const { result } = await renderHook(() => useFriendActions(), { wrapper: wrapper(qc) });
    await act(async () => result.current.respond.mutate({ request: askMaya, accept: true }));
    expect(requests(qc).incoming).toEqual([]);
    expect(friends(qc).map((f) => f.userId)).toEqual(['u-maya', 'u-sam']);
    expect(mockRespond).toHaveBeenCalledWith({}, 'u-maya', true);
    await act(async () => release());
    await waitFor(() => expect(result.current.respond.isSuccess).toBe(true));
  });

  it('puts the request back and says so when accepting fails', async () => {
    const qc = newClient();
    seed(qc);
    mockRespond.mockRejectedValue(new TypeError('Failed to fetch'));
    const { result } = await renderHook(() => useFriendActions(), { wrapper: wrapper(qc) });
    await act(async () => result.current.respond.mutate({ request: askMaya, accept: true }));
    await waitFor(() => expect(alert).toHaveBeenCalled());
    await waitFor(() => expect(result.current.respond.isError).toBe(true));
    expect(alert.mock.calls[0]![0]).toBe('Couldn’t accept Maya Rose’s request');
    expect(requests(qc).incoming).toEqual([askMaya]);
    expect(friends(qc).map((f) => f.userId)).toEqual(['u-sam']);
  });

  it('declining removes the request; a vanished request is not an error', async () => {
    const qc = newClient();
    seed(qc);
    mockRespond.mockRejectedValue({ message: 'request_not_found' });
    const { result } = await renderHook(() => useFriendActions(), { wrapper: wrapper(qc) });
    await act(async () => result.current.respond.mutate({ request: askMaya, accept: false }));
    await waitFor(() => expect(alert).toHaveBeenCalled());
    await waitFor(() => expect(result.current.respond.isError).toBe(true));
    expect(alert.mock.calls[0]![0]).toBe('Request no longer available');
    expect(requests(qc).incoming).toEqual([]);
  });

  it('cancelling an outgoing request rolls back on failure', async () => {
    const qc = newClient();
    qc.setQueryData(qk.connect.friendRequests, { incoming: [], outgoing: [askMaya] });
    mockCancel.mockRejectedValue(new Error('boom'));
    const { result } = await renderHook(() => useFriendActions(), { wrapper: wrapper(qc) });
    await act(async () => result.current.cancel.mutate(askMaya));
    await waitFor(() => expect(alert).toHaveBeenCalled());
    await waitFor(() => expect(result.current.cancel.isError).toBe(true));
    expect(alert.mock.calls[0]![0]).toBe('Couldn’t cancel your request to Maya Rose');
    expect(requests(qc).outgoing).toEqual([askMaya]);
  });

  it('removes a friend and restores them when it fails', async () => {
    const qc = newClient();
    seed(qc);
    mockRemove.mockRejectedValue(new Error('boom'));
    const { result } = await renderHook(() => useFriendActions(), { wrapper: wrapper(qc) });
    await act(async () => result.current.remove.mutate(sam));
    await waitFor(() => expect(alert).toHaveBeenCalled());
    await waitFor(() => expect(result.current.remove.isError).toBe(true));
    expect(alert.mock.calls[0]![0]).toBe('Couldn’t remove sam');
    expect(friends(qc)).toEqual([sam]);
  });

  it('keeps a removed friend gone on success', async () => {
    const qc = newClient();
    seed(qc);
    mockRemove.mockResolvedValue(undefined);
    const { result } = await renderHook(() => useFriendActions(), { wrapper: wrapper(qc) });
    await act(async () => result.current.remove.mutate(sam));
    await waitFor(() => expect(result.current.remove.isSuccess).toBe(true));
    expect(alert).not.toHaveBeenCalled();
    expect(mockRemove).toHaveBeenCalledWith({}, 'u-sam');
  });
});

describe('useMessageFriend', () => {
  const direct = (id: string, peer: string): SecureConversation =>
    ({
      id,
      kind: 'direct',
      members: [
        { id: 'me', username: 'me' },
        { id: peer, username: 'x' },
      ],
    }) as unknown as SecureConversation;

  it('reuses the existing direct chat', async () => {
    const qc = newClient();
    qc.setQueryData(qk.connect.inbox, [direct('c-1', 'u-sam'), direct('c-2', 'u-maya')]);
    const { result } = await renderHook(() => useMessageFriend(), { wrapper: wrapper(qc) });
    await act(async () => result.current.open(maya));
    expect(mockCreate).not.toHaveBeenCalled();
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/messages/[id]', params: { id: 'c-2' } });
  });

  it('starts a direct chat when there is none', async () => {
    const qc = newClient();
    qc.setQueryData(qk.connect.inbox, [direct('c-1', 'u-sam')]);
    mockCreate.mockResolvedValue('c-new');
    const { result } = await renderHook(() => useMessageFriend(), { wrapper: wrapper(qc) });
    await act(async () => result.current.open(maya));
    await waitFor(() => expect(mockPush).toHaveBeenCalled());
    await waitFor(() => expect(result.current.pendingId).toBeUndefined());
    expect(mockCreate).toHaveBeenCalledWith({}, 'direct', ['u-maya']);
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/messages/[id]', params: { id: 'c-new' } });
  });

  it('explains when the person no longer accepts messages', async () => {
    const qc = newClient();
    mockCreate.mockRejectedValue({ message: 'cannot_message' });
    const { result } = await renderHook(() => useMessageFriend(), { wrapper: wrapper(qc) });
    await act(async () => result.current.open(maya));
    await waitFor(() => expect(alert).toHaveBeenCalled());
    await waitFor(() => expect(result.current.pendingId).toBeUndefined());
    expect(alert.mock.calls[0]).toEqual([
      'Couldn’t start chat',
      'You can’t message Maya Rose right now.',
    ]);
    expect(mockPush).not.toHaveBeenCalled();
  });
});

describe('useFriendRequests', () => {
  const interval = (qc: QueryClient) =>
    qc.getQueryCache().find({ queryKey: qk.connect.friendRequests })!.observers[0]!.options
      .refetchInterval;

  it('polls every 30 s while the screen is focused', async () => {
    const qc = newClient();
    mockFetchRequests.mockResolvedValue({ incoming: [askMaya], outgoing: [] });
    const { result } = await renderHook(() => useFriendRequests(true), { wrapper: wrapper(qc) });
    await waitFor(() => expect(result.current.data?.incoming).toHaveLength(1));
    expect(interval(qc)).toBe(30_000);
  });

  it('stops polling while another screen is on top', async () => {
    const qc = newClient();
    mockFetchRequests.mockResolvedValue({ incoming: [], outgoing: [] });
    const { result } = await renderHook(() => useFriendRequests(false), { wrapper: wrapper(qc) });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(interval(qc)).toBe(false);
  });
});

describe('useOnlinePeers', () => {
  it('watches only the people it is given, and only if I show my own status', async () => {
    const stop = jest.fn();
    mockWatch.mockReturnValue(stop);
    mockPrivacy.mockResolvedValue({ show_online: true });
    const { result, unmount } = await renderHook(() => useOnlinePeers(['u-sam', 'u-sam']), {
      wrapper: wrapper(newClient()),
    });
    await waitFor(() => expect(mockWatch).toHaveBeenCalledTimes(1));
    expect(mockWatch.mock.calls[0]![1]).toEqual(['u-sam']);
    expect(result.current.size).toBe(0);
    await unmount();
    expect(stop).toHaveBeenCalled();
  });

  it('subscribes to nobody when my own online status is off', async () => {
    mockPrivacy.mockResolvedValue({ show_online: false });
    const { result } = await renderHook(() => useOnlinePeers(['u-sam']), {
      wrapper: wrapper(newClient()),
    });
    await waitFor(() => expect(mockPrivacy).toHaveBeenCalled());
    expect(mockWatch).not.toHaveBeenCalled();
    expect(result.current.size).toBe(0);
  });
});

describe('Friends screen', () => {
  const direct = { id: 'c-1', kind: 'direct', members: [{ id: 'me' }, { id: 'u-sam' }] };
  const renderScreen = async () => {
    const qc = newClient();
    await render(
      <QueryClientProvider client={qc}>
        <FriendsScreen />
      </QueryClientProvider>,
    );
    return qc;
  };

  it('lists requests and friends, and only watches presence for people I already chat with', async () => {
    mockFetchRequests.mockResolvedValue({
      incoming: [askMaya],
      outgoing: [{ ...askMaya, userId: 'u-out', username: 'zed', displayName: null }],
    });
    mockFetchFriends.mockResolvedValue([maya, sam]);
    mockFetchInbox.mockResolvedValue([direct]);
    mockPrivacy.mockResolvedValue({ show_online: true });
    mockWatch.mockReturnValue(jest.fn());
    await renderScreen();

    await waitFor(() => expect(screen.getByText('@sam')).toBeTruthy());
    expect(screen.getByRole('button', { name: 'Accept request from Maya Rose' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Cancel request to zed' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Message Maya Rose' })).toBeTruthy();
    expect(screen.getByLabelText('Requests, 2')).toBeTruthy();
    expect(screen.getByLabelText('Friends, 2')).toBeTruthy();
    await waitFor(() => expect(mockWatch).toHaveBeenCalled());
    // Maya has no direct chat with me yet: presence is not allowed for her.
    expect(mockWatch.mock.calls[0]![1]).toEqual(['u-sam']);
  });

  it('shows a friendly empty state', async () => {
    mockFetchRequests.mockResolvedValue({ incoming: [], outgoing: [] });
    mockFetchFriends.mockResolvedValue([]);
    mockFetchInbox.mockResolvedValue([]);
    await renderScreen();
    await waitFor(() => expect(screen.getByText('No friends yet')).toBeTruthy());
    expect(screen.queryByLabelText(/^Requests/)).toBeNull();
  });

  it('offers a retry when friends fail to load', async () => {
    mockFetchRequests.mockResolvedValue({ incoming: [], outgoing: [] });
    mockFetchFriends.mockRejectedValueOnce(new Error('boom')).mockResolvedValue([sam]);
    mockFetchInbox.mockResolvedValue([]);
    await renderScreen();
    await waitFor(() => expect(screen.getByText('Couldn’t load your friends.')).toBeTruthy());
    await fireEvent.press(screen.getByRole('button', { name: 'Try again' }));
    await waitFor(() => expect(screen.getByText('@sam')).toBeTruthy());
  });

  it('sends a request and refreshes the request list', async () => {
    mockFetchRequests.mockResolvedValue({ incoming: [], outgoing: [] });
    mockFetchFriends.mockResolvedValue([sam]);
    mockFetchInbox.mockResolvedValue([]);
    mockSend.mockResolvedValue('sent');
    await renderScreen();
    await waitFor(() => expect(screen.getByText('@sam')).toBeTruthy());
    await fireEvent.changeText(screen.getByLabelText('Friend’s username'), '@Zed');
    await fireEvent.press(screen.getByRole('button', { name: 'Send request' }));
    await waitFor(() => expect(screen.getByText('Request sent to @zed')).toBeTruthy());
    expect(mockSend).toHaveBeenCalledWith({}, 'zed');
    await waitFor(() => expect(mockFetchRequests.mock.calls.length).toBeGreaterThan(1));
  });
});

describe('New chat friends quick-pick', () => {
  const renderNew = async () =>
    render(
      <QueryClientProvider client={newClient()}>
        <NewChat />
      </QueryClientProvider>,
    );

  it('lists friends while the search box is empty and picks one with a tap', async () => {
    mockFetchFriends.mockResolvedValue([maya, sam]);
    await renderNew();
    await waitFor(() => expect(screen.getByText('Friends')).toBeTruthy());
    await fireEvent.press(screen.getByText('maya'));
    expect(screen.getByRole('button', { name: 'Message maya' })).toBeTruthy();
  });

  it('goes back to search results once you type', async () => {
    mockFetchFriends.mockResolvedValue([maya]);
    mockSearch.mockResolvedValue([
      { id: 'u-x', username: 'xavier', display_name: 'Xavier', avatar_path: null },
    ]);
    await renderNew();
    await waitFor(() => expect(screen.getByText('Friends')).toBeTruthy());
    await fireEvent.changeText(screen.getByLabelText('Search people'), 'xa');
    await waitFor(() => expect(screen.getByText('xavier')).toBeTruthy());
    expect(screen.queryByText('Friends')).toBeNull();
    expect(screen.queryByText('maya')).toBeNull();
  });

  it('keeps the old prompt when you have no friends yet', async () => {
    mockFetchFriends.mockResolvedValue([]);
    await renderNew();
    await waitFor(() => expect(mockFetchFriends).toHaveBeenCalled());
    expect(screen.getByText(/Search for someone to message/)).toBeTruthy();
    expect(screen.queryByText('Friends')).toBeNull();
  });
});

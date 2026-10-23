import type * as Api from '@vybora/api';
import type * as Router from 'react-router';
import type { SecureConversation } from '@vybora/api';
import type { ConnectEngine, LocalMessage } from '@vybora/e2ee';
import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useEffect, useState } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '@/test/utils';
import { MessageKindsProvider, useMessageKinds } from './kinds/context';
import { takeThreadIntent } from './threadIntents';
import { replyDraftOf, useChatActions } from './useChatActions';

const api = vi.hoisted(() => ({
  fetchSecureInbox: vi.fn(),
  fetchNicknames: vi.fn(),
  fetchFriends: vi.fn(),
  fetchFriendRequests: vi.fn(),
  fetchMyProfile: vi.fn(),
  sendFriendRequest: vi.fn(),
  respondFriendRequest: vi.fn(),
  createSecureConversation: vi.fn(),
}));
vi.mock('@vybora/api', async (orig) => ({ ...(await orig<typeof Api>()), ...api }));
vi.mock('@/lib/supabase', () => ({ supabase: {} }));
vi.mock('./ConnectProvider', () => ({ useConnect: () => ({ engine: null }) }));
vi.mock('@/features/auth/AuthProvider', () => ({
  useMe: () => ({ userId: 'me', profile: { id: 'me', username: 'me' } }),
}));
const navigate = vi.hoisted(() => vi.fn());
vi.mock('react-router', async (orig) => ({
  ...(await orig<typeof Router>()),
  useNavigate: () => navigate,
}));

const member = (id: string, username: string, role: 'admin' | 'member' = 'member') => ({
  id,
  username,
  display_name: username,
  avatar_path: null,
  role,
  read_seq: 0,
  delivered_seq: 0,
});
const group = {
  id: 'g1',
  kind: 'group',
  title: 'Weekend crew',
  members: [member('me', 'me'), member('maya', 'Maya'), member('leo', 'Leo')],
  settingsPolicy: 'everyone',
  myRole: 'member',
  archived: false,
} as unknown as SecureConversation;
const direct = {
  id: 'd1',
  kind: 'direct',
  title: null,
  members: [member('me', 'me'), member('rin', 'Rin')],
  archived: false,
} as unknown as SecureConversation;

const msg = (over: Partial<LocalMessage> = {}): LocalMessage => ({
  id: 'm1',
  conversationId: 'g1',
  seq: 4,
  senderId: 'maya',
  senderDeviceId: 'd',
  createdAt: '2026-10-22T10:00:00Z',
  expiresAt: null,
  status: 'received',
  kind: 'text',
  body: 'Lunch at noon?',
  reactions: {},
  ...over,
});

const forbidden = (message: string) => Object.assign(new Error(message), { code: 'forbidden' });

type Fn = ReturnType<typeof vi.fn>;
type Fake = ConnectEngine & {
  [
    K in
      | 'send'
      | 'edit'
      | 'pin'
      | 'vote'
      | 'star'
      | 'forward'
      | 'consumeViewOnce'
      | 'listPins'
      | 'listMessages'
  ]: Fn;
};

function fakeEngine(over: Partial<Record<keyof ConnectEngine, unknown>> = {}) {
  return {
    listPins: vi.fn(async () => []),
    listMessages: vi.fn(async () => []),
    getMessage: vi.fn(async () => null),
    listStarred: vi.fn(async () => []),
    send: vi.fn(async () => null),
    edit: vi.fn(async () => null),
    pin: vi.fn(async () => null),
    vote: vi.fn(async () => null),
    star: vi.fn(async () => undefined),
    forward: vi.fn(async () => null),
    consumeViewOnce: vi.fn(
      async () => new Uint8Array([0x89, 0x50, 0x4e, 0x47, 13, 10, 26, 10, 0, 0, 0, 0]),
    ),
    ...over,
  } as unknown as Fake;
}

type Actions = ReturnType<typeof useChatActions>;
let actions!: Actions;
let kindsSeen!: ReturnType<typeof useMessageKinds>;

function KindsProbe() {
  kindsSeen = useMessageKinds();
  return null;
}
function Harness({ engine, conv = group }: { engine: ConnectEngine; conv?: SecureConversation }) {
  const a = useChatActions({
    engine,
    conversationId: conv.id,
    conv,
    userId: 'me',
    nameOf: (id) => ({ me: 'You', maya: 'Maya', leo: 'Leo', rin: 'Rin' })[id] ?? 'Someone',
    jumpTo: vi.fn(),
  });
  useEffect(() => {
    actions = a;
  });
  actions = a;
  return (
    <MessageKindsProvider value={a.kinds}>
      <KindsProbe />
      {a.dialogs}
      <p data-testid="busy">{[...a.busy].join(',')}</p>
    </MessageKindsProvider>
  );
}

beforeEach(() => {
  Object.values(api).forEach((f) => f.mockReset());
  navigate.mockReset();
  api.fetchSecureInbox.mockResolvedValue([group, direct]);
  api.fetchNicknames.mockResolvedValue({});
  api.fetchFriends.mockResolvedValue([]);
  api.fetchFriendRequests.mockResolvedValue({ incoming: [], outgoing: [] });
});

describe('contact cards resolve from the server', () => {
  function ContactProbe({ userId, onState }: { userId: string; onState: (s: unknown) => void }) {
    const s = useMessageKinds().useContact(userId);
    onState(s);
    return null;
  }

  it('uses the server profile for the card’s user id and the friendship state', async () => {
    api.fetchMyProfile.mockResolvedValue({
      id: 'rin',
      username: 'rin',
      display_name: 'Rin Okada',
      avatar_path: null,
      status: 'active',
    });
    api.fetchFriends.mockResolvedValue([{ userId: 'rin', username: 'rin' }]);
    const states: unknown[] = [];
    const engine = fakeEngine();
    function Both() {
      const a = useChatActions({
        engine,
        conversationId: 'g1',
        conv: group,
        userId: 'me',
        nameOf: () => 'x',
        jumpTo: vi.fn(),
      });
      return (
        <MessageKindsProvider value={a.kinds}>
          <ContactProbe userId="rin" onState={(s) => states.push(s)} />
        </MessageKindsProvider>
      );
    }
    renderWithProviders(<Both />);
    await waitFor(() =>
      expect(states.at(-1)).toEqual({
        status: 'found',
        relation: 'friends',
        adding: false,
        profile: { id: 'rin', username: 'rin', displayName: 'Rin Okada', avatarPath: null },
      }),
    );
    expect(api.fetchMyProfile).toHaveBeenCalledWith({}, 'rin');
    expect(states[0]).toEqual({ status: 'loading' });
  });

  it('treats a missing or suspended profile as no one', async () => {
    api.fetchMyProfile.mockResolvedValue({ id: 'x', username: 'x', status: 'suspended' });
    const states: unknown[] = [];
    const engine = fakeEngine();
    function One() {
      const a = useChatActions({
        engine,
        conversationId: 'g1',
        conv: group,
        userId: 'me',
        nameOf: () => 'x',
        jumpTo: vi.fn(),
      });
      return (
        <MessageKindsProvider value={a.kinds}>
          <ContactProbe userId="x" onState={(s) => states.push(s)} />
        </MessageKindsProvider>
      );
    }
    renderWithProviders(<One />);
    await waitFor(() => expect(states.at(-1)).toEqual({ status: 'missing' }));
    // No row at all (PostgREST's "no rows" for .single()) is no one too.
    api.fetchMyProfile.mockRejectedValue({ code: 'PGRST116', message: 'no rows' });
    states.length = 0;
    function Two() {
      const a = useChatActions({
        engine,
        conversationId: 'g1',
        conv: group,
        userId: 'me',
        nameOf: () => 'x',
        jumpTo: vi.fn(),
      });
      return (
        <MessageKindsProvider value={a.kinds}>
          <ContactProbe userId="y" onState={(s) => states.push(s)} />
        </MessageKindsProvider>
      );
    }
    renderWithProviders(<Two />);
    await waitFor(() => expect(states.at(-1)).toEqual({ status: 'missing' }));
  });

  it('never turns a failed lookup into "VYBORA user"', async () => {
    api.fetchMyProfile.mockRejectedValue(new TypeError('Failed to fetch'));
    const states: unknown[] = [];
    const engine = fakeEngine();
    function Failing() {
      const a = useChatActions({
        engine,
        conversationId: 'g1',
        conv: group,
        userId: 'me',
        nameOf: () => 'x',
        jumpTo: vi.fn(),
      });
      return (
        <MessageKindsProvider value={a.kinds}>
          <ContactProbe userId="z" onState={(s) => states.push(s)} />
        </MessageKindsProvider>
      );
    }
    renderWithProviders(<Failing />);
    await waitFor(() => expect(states.at(-1)).toEqual({ status: 'error' }));
    expect(states).not.toContainEqual({ status: 'missing' });
  });

  it('adds a friend by the resolved username, never the card’s', async () => {
    api.sendFriendRequest.mockResolvedValue('sent');
    renderWithProviders(<Harness engine={fakeEngine()} />);
    act(() =>
      kindsSeen.onAddFriend(
        { id: 'rin', username: 'rin', displayName: null, avatarPath: null },
        false,
      ),
    );
    await waitFor(() => expect(api.sendFriendRequest).toHaveBeenCalledWith({}, 'rin'));
    expect(await screen.findByText('Request sent to @rin')).toBeInTheDocument();
  });
});

describe('accepting from a contact card', () => {
  it('accepts their request by id', async () => {
    api.respondFriendRequest.mockResolvedValue(undefined);
    renderWithProviders(<Harness engine={fakeEngine()} />);
    act(() =>
      kindsSeen.onAddFriend(
        { id: 'rin', username: 'rin', displayName: null, avatarPath: null },
        true,
      ),
    );
    await waitFor(() => expect(api.respondFriendRequest).toHaveBeenCalledWith({}, 'rin', true));
    expect(api.sendFriendRequest).not.toHaveBeenCalled();
    expect(await screen.findByText('You and @rin are now friends')).toBeInTheDocument();
  });
});

describe('polls', () => {
  it('votes through the engine and explains a refusal', async () => {
    const engine = fakeEngine();
    renderWithProviders(<Harness engine={engine} />);
    const poll = msg({ id: 'p1', kind: 'poll', body: undefined });
    let ok: boolean | undefined;
    await act(async () => {
      ok = await kindsSeen.onVote(poll, [1]);
    });
    expect(engine.vote).toHaveBeenCalledWith('g1', 'p1', [1]);
    expect(ok).toBe(true);
    engine.vote.mockRejectedValueOnce(forbidden('vote_not_allowed'));
    await act(async () => {
      ok = await kindsSeen.onVote(poll, [0]);
    });
    expect(ok).toBe(false);
    expect(await screen.findByText('This poll didn’t take your vote')).toBeInTheDocument();
  });
});

describe('view once', () => {
  it('consumes once, shows it, and says so if it was already opened', async () => {
    Object.assign(URL, { createObjectURL: vi.fn(() => 'blob:x'), revokeObjectURL: vi.fn() });
    const engine = fakeEngine();
    renderWithProviders(<Harness engine={engine} />);
    const m = msg({
      kind: 'attachment',
      body: undefined,
      viewOnce: { kind: 'image', consumed: false },
    });
    act(() => void kindsSeen.onOpenViewOnce(m));
    expect(await screen.findByRole('dialog', { name: 'View once photo' })).toBeInTheDocument();
    expect(engine.consumeViewOnce).toHaveBeenCalledTimes(1);
    expect(engine.consumeViewOnce).toHaveBeenCalledWith('g1', 'm1');
    await userEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:x');
    engine.consumeViewOnce.mockResolvedValueOnce(null);
    act(() => void kindsSeen.onOpenViewOnce(m));
    expect(await screen.findByText('This was already opened.')).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});

describe('pins', () => {
  it('asks before replacing the oldest of 3 pins', async () => {
    const pins = ['a', 'b', 'c'].map((id) => ({ messageId: id, pinnedBy: 'maya', pinnedAt: '' }));
    const engine = fakeEngine({ listPins: vi.fn(async () => pins) });
    renderWithProviders(<Harness engine={engine} />);
    await waitFor(() => expect(engine.listPins).toHaveBeenCalled());
    await waitFor(() => expect(actions.pinnedIds.size).toBe(3));
    act(() => actions.onMenuAction('pin', msg({ id: 'new' })));
    const dialog = await screen.findByRole('dialog', { name: 'Replace the oldest pin?' });
    expect(within(dialog).getByText(/This replaces the oldest pin/)).toBeInTheDocument();
    expect(engine.pin).not.toHaveBeenCalled();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Pin' }));
    expect(engine.pin).toHaveBeenCalledWith('g1', 'new', true);
  });

  it('leaves a deleted pinned message out of the pin bar', async () => {
    const pins = ['a', 'b'].map((id) => ({ messageId: id, pinnedBy: 'maya', pinnedAt: '' }));
    const engine = fakeEngine({
      listPins: vi.fn(async () => pins),
      getMessage: vi.fn(async (_c: string, id: string) =>
        msg({ id, body: `pinned ${id}`, deleted: id === 'a' }),
      ),
    });
    renderWithProviders(<Harness engine={engine} />);
    await waitFor(() => expect(actions.pinItems).toHaveLength(1));
    expect(actions.pinItems[0]).toEqual({ messageId: 'b', summary: 'pinned b' });
  });

  it('pins straight away when there is room, and explains a refusal', async () => {
    const engine = fakeEngine({
      pin: vi.fn(async () => Promise.reject(forbidden('pin_not_allowed'))),
    });
    renderWithProviders(<Harness engine={engine} />);
    await waitFor(() => expect(engine.listPins).toHaveBeenCalled());
    act(() => actions.onMenuAction('pin', msg()));
    expect(await screen.findByText('This message can’t be pinned right now')).toBeInTheDocument();
    expect(engine.pin).toHaveBeenCalledWith('g1', 'm1', true);
  });
});

describe('forward', () => {
  it('forwards to every chat picked', async () => {
    const engine = fakeEngine();
    renderWithProviders(<Harness engine={engine} />);
    act(() => actions.onMenuAction('forward', msg()));
    const dialog = await screen.findByRole('dialog', { name: 'Forward to' });
    await userEvent.click(await within(dialog).findByRole('checkbox', { name: 'Rin' }));
    await userEvent.click(within(dialog).getByRole('checkbox', { name: 'Weekend crew' }));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Forward to 2 chats' }));
    await waitFor(() => expect(engine.forward).toHaveBeenCalledTimes(2));
    expect(engine.forward).toHaveBeenCalledWith('g1', 'm1', 'd1', expect.anything());
    expect(engine.forward).toHaveBeenCalledWith('g1', 'm1', 'g1', expect.anything());
    expect(await screen.findByText('Forwarded to 2 chats')).toBeInTheDocument();
  });

  it('tries every chat and sums up what failed', async () => {
    const third = {
      ...direct,
      id: 'd2',
      members: [member('me', 'me'), member('leo', 'Leo')],
    } as unknown as SecureConversation;
    api.fetchSecureInbox.mockResolvedValue([group, direct, third]);
    const failed = msg({
      id: 'f1',
      conversationId: 'd1',
      senderId: 'me',
      status: 'failed',
      forwarded: true,
      createdAt: new Date(Date.now() + 1000).toISOString(),
    });
    const engine = fakeEngine({
      forward: vi.fn(async (_from: string, _id: string, to: string) => {
        if (to === 'd2') throw Object.assign(new Error('x'), { code: 'forbidden' });
        if (to === 'd1') throw Object.assign(new Error('x'), { code: 'network' });
        return null;
      }),
      listMessages: vi.fn(async (conv: string) => (conv === 'd1' ? [failed] : [])),
    });
    renderWithProviders(<Harness engine={engine} />);
    act(() => actions.onMenuAction('forward', msg()));
    const dialog = await screen.findByRole('dialog', { name: 'Forward to' });
    for (const name of ['Rin', 'Leo', 'Weekend crew'])
      await userEvent.click(await within(dialog).findByRole('checkbox', { name }));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Forward to 3 chats' }));
    await waitFor(() => expect(engine.forward).toHaveBeenCalledTimes(3));
    expect(
      await screen.findByText(
        'Forwarded to 1 of 3 chats. Couldn’t forward to Leo. Not sent to Rin yet: use Retry there.',
      ),
    ).toBeInTheDocument();
  });
});

describe('switching chats', () => {
  it('closes this chat’s dialogs and drops late results when the chat changes', async () => {
    Object.assign(URL, { createObjectURL: vi.fn(() => 'blob:x'), revokeObjectURL: vi.fn() });
    let open!: (b: Uint8Array) => void;
    const engine = fakeEngine({
      consumeViewOnce: vi.fn(() => new Promise<Uint8Array>((r) => (open = r))),
    });
    let switchTo!: (c: SecureConversation) => void;
    function Switching() {
      const [c, setC] = useState<SecureConversation>(group);
      switchTo = setC;
      return <Harness engine={engine} conv={c} />;
    }
    renderWithProviders(<Switching />);
    act(() => actions.onMenuAction('forward', msg()));
    expect(await screen.findByRole('dialog', { name: 'Forward to' })).toBeInTheDocument();
    const vo = msg({ id: 'v1', kind: 'attachment', viewOnce: { kind: 'image', consumed: false } });
    act(() => void kindsSeen.onOpenViewOnce(vo));
    act(() => switchTo(direct));
    expect(screen.queryByRole('dialog')).toBeNull();
    await act(async () =>
      open(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 13, 10, 26, 10, 0, 0, 0, 0])),
    );
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});

describe('edit, star, delete', () => {
  it('saves an edit and explains when it is too late', async () => {
    const engine = fakeEngine({
      edit: vi.fn(async () => Promise.reject(forbidden('edit_not_allowed'))),
    });
    renderWithProviders(<Harness engine={engine} />);
    act(() => actions.onMenuAction('edit', msg({ senderId: 'me', status: 'sent' })));
    expect(actions.editing).toEqual({ id: 'm1', text: 'Lunch at noon?', caption: false });
    await act(async () => actions.saveEdit('Lunch at one?'));
    expect(engine.edit).toHaveBeenCalledWith('g1', 'm1', 'Lunch at one?', undefined);
    expect(await screen.findByText('This message can no longer be edited')).toBeInTheDocument();
    // Refused: the edit stays open with what I typed.
    expect(actions.editing).toEqual({ id: 'm1', text: 'Lunch at one?', caption: false });
  });

  it('closes the edit when it will retry', async () => {
    const engine = fakeEngine({
      edit: vi.fn(async () => Promise.reject(Object.assign(new Error('n'), { code: 'network' }))),
    });
    renderWithProviders(<Harness engine={engine} />);
    act(() => actions.onMenuAction('edit', msg({ senderId: 'me', status: 'sent' })));
    await act(async () => actions.saveEdit('Lunch at one?'));
    expect(await screen.findByText('Couldn’t send yet. It will retry.')).toBeInTheDocument();
    expect(actions.editing).toBeNull();
  });

  it('keeps a caption edit open when it is too long', async () => {
    const engine = fakeEngine();
    renderWithProviders(<Harness engine={engine} />);
    act(() =>
      actions.onMenuAction(
        'edit',
        msg({ senderId: 'me', status: 'sent', kind: 'attachment', body: undefined, caption: 'a' }),
      ),
    );
    await act(async () => actions.saveEdit('x'.repeat(2001)));
    expect(engine.edit).not.toHaveBeenCalled();
    expect(await screen.findByText('Captions can be up to 2000 characters')).toBeInTheDocument();
    expect(actions.editing?.text).toHaveLength(2001);
  });

  it('explains a failed star', async () => {
    const engine = fakeEngine({ star: vi.fn(async () => Promise.reject(new Error('disk'))) });
    renderWithProviders(<Harness engine={engine} />);
    await act(async () => actions.onMenuAction('star', msg()));
    expect(await screen.findByText('Couldn’t star this message. Try again.')).toBeInTheDocument();
  });

  it('explains a view once that failed to open, and ignores a second tap meanwhile', async () => {
    let fail!: (e: unknown) => void;
    const engine = fakeEngine({
      consumeViewOnce: vi.fn(() => new Promise((_, reject) => (fail = reject))),
    });
    renderWithProviders(<Harness engine={engine} />);
    const vo = msg({ kind: 'attachment', viewOnce: { kind: 'image', consumed: false } });
    act(() => void kindsSeen.onOpenViewOnce(vo));
    act(() => void kindsSeen.onOpenViewOnce(vo));
    expect(engine.consumeViewOnce).toHaveBeenCalledTimes(1);
    await act(async () => fail(Object.assign(new Error('n'), { code: 'network' })));
    expect(
      await screen.findByText(
        'Couldn’t open it. Check your connection and try again. It’s still unopened.',
      ),
    ).toBeInTheDocument();
  });

  it('stars locally', async () => {
    const engine = fakeEngine();
    renderWithProviders(<Harness engine={engine} />);
    await act(async () => actions.onMenuAction('star', msg()));
    expect(engine.star).toHaveBeenCalledWith('g1', 'm1', true);
  });

  it('shows a delete as pending, and keeps the message when it fails', async () => {
    let fail!: (e: unknown) => void;
    const engine = fakeEngine({
      send: vi.fn(() => new Promise((_, reject) => (fail = reject))),
    });
    renderWithProviders(<Harness engine={engine} />);
    let done!: Promise<void>;
    act(() => {
      done = actions.remove(['m1']);
    });
    expect(screen.getByTestId('busy')).toHaveTextContent('m1');
    await act(async () => {
      fail(Object.assign(new Error('net'), { code: 'network' }));
      await done;
    });
    expect(screen.getByTestId('busy')).toHaveTextContent('');
    expect(
      await screen.findByText(
        'Couldn’t delete for everyone yet. It will retry when you’re back online.',
      ),
    ).toBeInTheDocument();
  });

  it('shows a reaction as pending until the server has it', async () => {
    let finish!: () => void;
    const engine = fakeEngine({ send: vi.fn(() => new Promise<void>((r) => (finish = r))) });
    renderWithProviders(<Harness engine={engine} />);
    act(() => actions.react(msg(), '👍'));
    expect(engine.send).toHaveBeenCalledWith('g1', {
      t: 'reaction',
      target: 'm1',
      emoji: '👍',
      remove: false,
    });
    expect(screen.getByTestId('busy')).toHaveTextContent('m1');
    await act(async () => finish());
    expect(screen.getByTestId('busy')).toHaveTextContent('');
  });
});

describe('reply privately', () => {
  it('opens the direct chat with the sender carrying a reply quote', async () => {
    api.createSecureConversation.mockResolvedValue('d-maya');
    renderWithProviders(<Harness engine={fakeEngine()} />);
    await act(async () => actions.onMenuAction('replyPrivately', msg()));
    await waitFor(() => expect(navigate).toHaveBeenCalledWith('/messages/d-maya'));
    expect(api.createSecureConversation).toHaveBeenCalledWith({}, 'direct', ['maya']);
    expect(takeThreadIntent('d-maya')).toEqual({
      reply: { id: 'm1', senderId: 'maya', preview: 'Lunch at noon?', name: 'Maya' },
    });
  });

  it('reuses an existing direct chat', async () => {
    const withMaya = {
      ...direct,
      id: 'd-old',
      members: [member('me', 'me'), member('maya', 'Maya')],
    } as unknown as SecureConversation;
    api.fetchSecureInbox.mockResolvedValue([group, withMaya]);
    const { qc } = renderWithProviders(<Harness engine={fakeEngine()} />);
    await waitFor(() => expect(qc.getQueryData(['connect', 'inbox'])).toBeTruthy());
    await act(async () => actions.onMenuAction('replyPrivately', msg()));
    expect(navigate).toHaveBeenCalledWith('/messages/d-old');
    expect(api.createSecureConversation).not.toHaveBeenCalled();
    takeThreadIntent('d-old');
  });
});

describe('my view-once copy in quotes and info', () => {
  it('quotes it as a view once photo, never "Opened"', () => {
    const mine = msg({
      senderId: 'me',
      kind: 'attachment',
      body: undefined,
      viewOnce: { kind: 'image', consumed: true },
    });
    expect(replyDraftOf(mine, () => 'You', 'me').preview).toBe('View once photo');
  });
});

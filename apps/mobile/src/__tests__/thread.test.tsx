import type { LocalMessage } from '@vybora/e2ee';
import 'react-native-gesture-handler/jestSetup';
import {
  act as rtlAct,
  fireEvent,
  render,
  renderHook,
  screen,
} from '@testing-library/react-native';
import { AccessibilityInfo, StyleSheet, Text as RNText } from 'react-native';
import type { SecureConversation } from '@vybora/api';
jest.mock('react-native-worklets', () => require('react-native-worklets/src/mock'));
jest.mock('react-native-reanimated', () => require('react-native-reanimated/mock'));
jest.mock('@/lib/supabase', () => ({
  supabase: {},
  supabaseConfig: { url: 'http://x', anonKey: 'k' },
}));
const mockTypingListeners = new Map<string, (who: string, typing: boolean) => void>();
const mockTypingJoins: string[] = [];
const mockTypingLeaves: string[] = [];
jest.mock('@vybora/api', () => ({
  ...jest.requireActual('@vybora/api'),
  joinTypingChannel: (
    _c: unknown,
    conv: string,
    _u: string,
    cb: (who: string, t: boolean) => void,
  ) => {
    mockTypingListeners.set(conv, cb);
    mockTypingJoins.push(conv);
    return { send: jest.fn(), leave: () => mockTypingLeaves.push(conv) };
  },
}));
const mockStore = new Map<string, string>();
jest.mock('expo-secure-store', () => ({
  getItemAsync: (k: string) => Promise.resolve(mockStore.get(k) ?? null),
  setItemAsync: () => Promise.resolve(),
}));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 34, left: 0, right: 0 }),
}));
jest.mock('@/features/auth/AuthProvider', () => ({ useMe: () => ({ userId: 'me' }) }));
jest.mock('@/features/connect/ConnectProvider', () => ({ useConnect: () => ({ engine: null }) }));
jest.mock('@/features/connect/ui/Attachment', () => ({
  ImageAttachment: () => null,
  VideoAttachment: () => null,
  VoiceAttachment: () => null,
  FileAttachment: () => null,
}));

import { A11Y_STORAGE_KEY } from '@vybora/core';
import { chatThemeDefs } from '@vybora/config';
import type { ReactNode } from 'react';
import { useInboxTyping } from '@/features/connect/hooks';
import { ChatGlow, glowMotion } from '@/features/connect/ui/ChatGlow';
import { A11yProvider } from '@/lib/a11y';
import { LookScope, themeFor } from '@/lib/theme';
import { Bubble } from '@/features/connect/ui/Bubble';
import { ChatRow, RowPreviewLine } from '@/features/connect/ui/ChatRowParts';
import { MessageActions } from '@/features/connect/ui/MessageActions';
import { SwipeToReply } from '@/features/connect/ui/SwipeToReply';
import { useThemeDef } from '@/features/connect/ui/primitives';
import { UndoBar } from '@/features/connect/ui/UndoBar';
import { DateChip, JumpToLatest, UnreadDivider } from '@/features/connect/ui/ThreadParts';

const msg: LocalMessage = {
  id: 'm1',
  conversationId: 'c1',
  seq: 3,
  senderId: 'maya',
  senderDeviceId: 'd1',
  createdAt: '2026-10-15T14:05:00Z',
  expiresAt: null,
  status: 'received',
  kind: 'text',
  body: 'See you at 7',
  reactions: {},
};

function Harness({ runEnd }: { runEnd: boolean }) {
  const theme = useThemeDef({});
  return (
    <Bubble
      message={msg}
      mine={false}
      theme={theme}
      showSender={false}
      runStart
      runEnd={runEnd}
      onLongPress={jest.fn()}
      onRetry={jest.fn()}
      onOpenImage={jest.fn()}
      nameOf={() => 'Maya'}
    />
  );
}

function Actionable({
  message,
  onLongPress,
  onRetry,
  receipt,
}: {
  message: LocalMessage;
  onLongPress: (m: LocalMessage) => void;
  onRetry: (m: LocalMessage) => void;
  receipt?: 'failed';
}) {
  const theme = useThemeDef({});
  return (
    <Bubble
      message={message}
      mine
      theme={theme}
      receipt={receipt}
      showSender={false}
      runStart
      runEnd
      onLongPress={onLongPress}
      onRetry={onRetry}
      onOpenImage={jest.fn()}
      nameOf={() => 'You'}
    />
  );
}

const act = (actionName: string) => ({ nativeEvent: { actionName } });

describe('mobile conversation layout', () => {
  it('draws a tail only on the last bubble of a run and labels the message', async () => {
    const { rerender } = await render(<Harness runEnd />);
    expect(screen.getByTestId('bubble-tail')).toBeTruthy();
    expect(screen.getByLabelText(/^Maya, .+, See you at 7$/)).toBeTruthy();
    await rerender(<Harness runEnd={false} />);
    expect(screen.queryByTestId('bubble-tail')).toBeNull();
  });

  it('renders chips, the unread divider and the jump button accessibly', async () => {
    await render(
      <>
        <DateChip label="Today" />
        <UnreadDivider count={2} />
        <JumpToLatest count={2} onPress={jest.fn()} />
      </>,
    );
    expect(screen.getByRole('header', { name: 'Today' })).toBeTruthy();
    expect(screen.getByRole('header', { name: '2 unread messages' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Jump to latest message, 2 new' })).toBeTruthy();
  });

  it('exposes retry and message actions to screen readers and dispatches them', async () => {
    const failed: LocalMessage = { ...msg, senderId: 'me', status: 'failed' };
    const onRetry = jest.fn();
    const onLongPress = jest.fn();
    await render(
      <Actionable message={failed} receipt="failed" onRetry={onRetry} onLongPress={onLongPress} />,
    );
    const el = screen.getByLabelText(/^You, .+, See you at 7, not sent$/);
    expect(el.props.accessibilityActions).toEqual([
      { name: 'activate', label: 'Retry sending' },
      { name: 'longpress', label: 'Message actions' },
    ]);
    await fireEvent(el, 'accessibilityAction', act('activate'));
    expect(onRetry).toHaveBeenCalledWith(expect.objectContaining({ id: 'm1' }));
    await fireEvent(el, 'accessibilityAction', act('longpress'));
    expect(onLongPress).toHaveBeenCalledWith(expect.objectContaining({ id: 'm1' }));
  });

  it('offers no retry or actions where they do not apply', async () => {
    const onRetry = jest.fn();
    const onLongPress = jest.fn();
    await render(
      <Actionable
        message={{ ...msg, senderId: 'me', deleted: true }}
        onRetry={onRetry}
        onLongPress={onLongPress}
      />,
    );
    const el = screen.getByLabelText(/^You, /);
    expect(el.props.accessibilityActions).toEqual([]);
    await fireEvent(el, 'accessibilityAction', act('activate'));
    await fireEvent(el, 'accessibilityAction', act('longpress'));
    expect(onRetry).not.toHaveBeenCalled();
    expect(onLongPress).not.toHaveBeenCalled();
  });
});

function Selecting({
  selected,
  onToggleSelect,
  onLongPress = jest.fn(),
  showReplyButton,
  onReply,
}: {
  selected: boolean;
  onToggleSelect: (m: LocalMessage) => void;
  onLongPress?: (m: LocalMessage) => void;
  showReplyButton?: boolean;
  onReply?: (m: LocalMessage) => void;
}) {
  const theme = useThemeDef({});
  return (
    <Bubble
      message={msg}
      mine={false}
      theme={theme}
      showSender={false}
      runStart
      runEnd
      onLongPress={onLongPress}
      onRetry={jest.fn()}
      onOpenImage={jest.fn()}
      nameOf={() => 'Maya'}
      selecting
      selected={selected}
      onToggleSelect={onToggleSelect}
      showReplyButton={showReplyButton}
      onReply={onReply}
    />
  );
}

describe('message actions sheet', () => {
  it('lists the allowed actions under the reaction bar', async () => {
    const onAction = jest.fn();
    await render(
      <MessageActions
        message={msg}
        myReaction={null}
        actions={['reply', 'copy', 'select']}
        onClose={jest.fn()}
        onReact={jest.fn()}
        onAction={onAction}
      />,
    );
    expect(screen.getAllByRole('menuitem').length).toBeGreaterThan(3);
    await fireEvent.press(screen.getByText('Select'));
    expect(onAction).toHaveBeenCalledWith('select');
    expect(screen.queryByText('Delete for everyone')).toBeNull();
  });
});

describe('select mode and reply affordances', () => {
  it('toggles on press, drops the long-press action and carries selected state', async () => {
    const onToggle = jest.fn();
    const onLongPress = jest.fn();
    const { rerender } = await render(
      <Selecting selected={false} onToggleSelect={onToggle} onLongPress={onLongPress} />,
    );
    const el = screen.getByLabelText(/^Maya, .+, See you at 7$/);
    expect(el.props.accessibilityState).toEqual({ selected: false });
    expect(el.props.accessibilityActions).toEqual([{ name: 'activate', label: 'Select message' }]);
    await fireEvent(el, 'accessibilityAction', act('activate'));
    expect(onToggle).toHaveBeenCalledWith(expect.objectContaining({ id: 'm1' }));
    await fireEvent(el, 'accessibilityAction', act('longpress'));
    expect(onLongPress).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByText('See you at 7'));
    expect(onToggle).toHaveBeenCalledTimes(2);
    await rerender(<Selecting selected onToggleSelect={onToggle} onLongPress={onLongPress} />);
    const on = screen.getByLabelText(/^Maya, .+, See you at 7$/);
    expect(on.props.accessibilityState).toEqual({ selected: true });
    expect(on.props.accessibilityActions).toEqual([
      { name: 'activate', label: 'Deselect message' },
    ]);
  });

  it('lets taps on inner content and the retry text toggle instead of acting', async () => {
    const onToggle = jest.fn();
    const onRetry = jest.fn();
    function Failed({ selecting }: { selecting: boolean }) {
      const theme = useThemeDef({});
      return (
        <Bubble
          message={{ ...msg, senderId: 'me', status: 'failed' }}
          mine
          theme={theme}
          receipt="failed"
          showSender={false}
          runStart
          runEnd
          onLongPress={jest.fn()}
          onRetry={onRetry}
          onOpenImage={jest.fn()}
          nameOf={() => 'You'}
          selecting={selecting}
          onToggleSelect={onToggle}
        />
      );
    }
    const { rerender } = await render(<Failed selecting={false} />);
    expect(screen.getByTestId('bubble-content').props.pointerEvents).toBe('auto');
    await rerender(<Failed selecting />);
    expect(screen.getByTestId('bubble-content').props.pointerEvents).toBe('none');
    await fireEvent.press(screen.getByText('Not sent · Tap to retry'));
    expect(onToggle).toHaveBeenCalledWith(expect.objectContaining({ id: 'm1' }));
    expect(onRetry).not.toHaveBeenCalled();
  });

  it('shows an always-available reply button outside select mode', async () => {
    const onReply = jest.fn();
    const theme = { current: null as ReturnType<typeof useThemeDef> | null };
    function Plain() {
      theme.current = useThemeDef({});
      return (
        <Bubble
          message={msg}
          mine={false}
          theme={theme.current}
          showSender={false}
          runStart
          runEnd
          onLongPress={jest.fn()}
          onRetry={jest.fn()}
          onOpenImage={jest.fn()}
          nameOf={() => 'Maya'}
          showReplyButton
          onReply={onReply}
        />
      );
    }
    await render(<Plain />);
    await fireEvent.press(screen.getByLabelText('Reply'));
    expect(onReply).toHaveBeenCalledWith(expect.objectContaining({ id: 'm1' }));
  });

  it('renders the swipe wrapper around its content', async () => {
    await render(
      <SwipeToReply enabled onReply={jest.fn()} color="#000">
        <RNText>child</RNText>
      </SwipeToReply>,
    );
    expect(screen.getByText('child')).toBeTruthy();
  });
});

describe('mobile chat row preview', () => {
  it('shows You: with ticks, and typing in the accent colour', async () => {
    const { rerender } = await render(
      <RowPreviewLine
        unread={false}
        preview={{ prefix: 'You', text: 'See you', receipt: 'read', typing: false }}
      />,
    );
    expect(screen.getByText('You: See you')).toBeTruthy();
    expect(screen.getByLabelText('Read')).toBeTruthy();
    await rerender(
      <RowPreviewLine
        unread={false}
        preview={{ prefix: null, text: 'typing…', receipt: null, typing: true }}
      />,
    );
    expect(screen.getByText('typing…')).toBeTruthy();
  });
});

describe('undo bar', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('runs undo on press and calls onDone after 5 seconds', async () => {
    const onUndo = jest.fn();
    const onDone = jest.fn();
    const announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility');
    await render(<UndoBar message="Archived" onUndo={onUndo} onDone={onDone} />);
    expect(screen.getByText('Archived')).toBeTruthy();
    expect(announce).toHaveBeenCalledWith('Archived');
    const bar = screen.getByTestId('undo-bar');
    expect(StyleSheet.flatten(bar.props.style).bottom).toBe(50);
    await fireEvent.press(screen.getByText('Undo'));
    expect(onUndo).toHaveBeenCalled();
    await rtlAct(() => {
      jest.advanceTimersByTime(4_900);
    });
    expect(onDone).not.toHaveBeenCalled();
    await rtlAct(() => {
      jest.advanceTimersByTime(200);
    });
    expect(onDone).toHaveBeenCalledTimes(1);
  });
});

describe('typing in the chat list', () => {
  beforeEach(() => {
    mockTypingListeners.clear();
    mockTypingJoins.length = 0;
    mockTypingLeaves.length = 0;
  });
  afterEach(() => jest.useRealTimers());

  it('clears a typing indicator that never receives a stop after 5 seconds', async () => {
    jest.useFakeTimers();
    const { result } = await renderHook(() => useInboxTyping(['c1', 'c2'], true));
    await rtlAct(() => mockTypingListeners.get('c1')!('maya', true));
    expect(result.current.c1).toEqual(['maya']);
    await rtlAct(() => {
      jest.advanceTimersByTime(5_000);
    });
    expect(result.current.c1).toEqual([]);
  });

  it('keeps channels and live indicators when the same chats are reordered', async () => {
    const { result, rerender } = await renderHook(
      ({ ids }: { ids: string[] }) => useInboxTyping(ids, true),
      { initialProps: { ids: ['c1', 'c2'] } },
    );
    await rtlAct(() => mockTypingListeners.get('c1')!('maya', true));
    expect(mockTypingJoins).toEqual(['c1', 'c2']);
    await rerender({ ids: ['c2', 'c1'] });
    expect(mockTypingLeaves).toEqual([]);
    expect(mockTypingJoins).toEqual(['c1', 'c2']);
    expect(result.current.c1).toEqual(['maya']);
  });

  it('leaves only the removed chat and joins only the new one', async () => {
    const { result, rerender } = await renderHook(
      ({ ids }: { ids: string[] }) => useInboxTyping(ids, true),
      { initialProps: { ids: ['c1', 'c2'] } },
    );
    await rtlAct(() => mockTypingListeners.get('c1')!('maya', true));
    await rtlAct(() => mockTypingListeners.get('c2')!('sam', true));
    await rerender({ ids: ['c2', 'c3'] });
    expect(mockTypingLeaves).toEqual(['c1']);
    expect(mockTypingJoins).toEqual(['c1', 'c2', 'c3']);
    expect(result.current.c1).toBeUndefined();
    expect(result.current.c2).toEqual(['sam']);
  });

  it('clears the entry on a typing stop', async () => {
    const { result } = await renderHook(() => useInboxTyping(['c1'], true));
    await rtlAct(() => mockTypingListeners.get('c1')!('maya', true));
    expect(result.current.c1).toEqual(['maya']);
    await rtlAct(() => mockTypingListeners.get('c1')!('maya', false));
    expect(result.current.c1).toEqual([]);
  });

  it('leaves every channel on unmount', async () => {
    const { unmount } = await renderHook(() => useInboxTyping(['c1', 'c2'], true));
    await unmount();
    expect([...mockTypingLeaves].sort()).toEqual(['c1', 'c2']);
  });

  it('joins nothing when disabled', async () => {
    await renderHook(() => useInboxTyping(['c1'], false));
    expect(mockTypingListeners.size).toBe(0);
  });

  it('leaves every channel and clears state when paused', async () => {
    const { result, rerender } = await renderHook(
      ({ on }: { on: boolean }) => useInboxTyping(['c1', 'c2'], on),
      { initialProps: { on: true } },
    );
    await rtlAct(() => mockTypingListeners.get('c1')!('maya', true));
    expect(result.current.c1).toEqual(['maya']);
    await rerender({ on: false });
    expect([...mockTypingLeaves].sort()).toEqual(['c1', 'c2']);
    expect(result.current).toEqual({});
  });
});

describe('chat row accessibility actions', () => {
  const conv = {
    id: 'c1',
    kind: 'direct',
    pinned: false,
    archived: false,
    mutedUntil: null,
    notificationsEnabled: true,
    unreadCount: 0,
    members: [{ id: 'maya', username: 'maya', display_name: 'Maya', avatar_path: null }],
  } as unknown as SecureConversation;
  const handlers = () => ({
    onPress: jest.fn(),
    onLongPress: jest.fn(),
    onTogglePin: jest.fn(),
    onToggleMute: jest.fn(),
    onArchive: jest.fn(),
  });
  const preview = { prefix: null, text: 'hi', receipt: null, typing: false };

  it('exposes pin, mute, archive and more actions and dispatches them', async () => {
    const h = handlers();
    await render(
      <ChatRow
        conv={conv}
        myId="me"
        title="Maya"
        preview={preview}
        time="2:05 PM"
        online={false}
        {...h}
      />,
    );
    const row = screen.getByRole('button', { name: 'Maya' });
    expect(row.props.accessibilityActions).toEqual([
      { name: 'togglePin', label: 'Pin' },
      { name: 'toggleMute', label: 'Mute' },
      { name: 'archive', label: 'Archive' },
      { name: 'longpress', label: 'More actions' },
    ]);
    await fireEvent(row, 'accessibilityAction', { nativeEvent: { actionName: 'archive' } });
    await fireEvent(row, 'accessibilityAction', { nativeEvent: { actionName: 'togglePin' } });
    await fireEvent(row, 'accessibilityAction', { nativeEvent: { actionName: 'toggleMute' } });
    await fireEvent(row, 'accessibilityAction', { nativeEvent: { actionName: 'longpress' } });
    expect(h.onArchive).toHaveBeenCalledTimes(1);
    expect(h.onTogglePin).toHaveBeenCalledTimes(1);
    expect(h.onToggleMute).toHaveBeenCalledTimes(1);
    expect(h.onLongPress).toHaveBeenCalledTimes(1);
  });

  it('labels the actions by current state', async () => {
    await render(
      <ChatRow
        conv={{ ...conv, pinned: true, archived: true, mutedUntil: 'infinity' }}
        myId="me"
        title="Maya"
        preview={preview}
        time="2:05 PM"
        online={false}
        {...handlers()}
      />,
    );
    const labels = screen
      .getByRole('button', { name: /Maya/ })
      .props.accessibilityActions.map((a: { label: string }) => a.label);
    expect(labels).toEqual(['Unpin', 'Unmute', 'Unarchive', 'More actions']);
  });
});

/** Every host node in the rendered tree (react-native-svg renders named hosts). */
type HostNode = { type: string; props: Record<string, unknown>; children?: unknown[] | null };
function hosts(node: unknown): HostNode[] {
  if (!node || typeof node !== 'object') return [];
  if (Array.isArray(node)) return node.flatMap(hosts);
  const n = node as HostNode;
  return [n, ...(n.children ?? []).flatMap(hosts)];
}
const hasGradient = () => hosts(screen.toJSON()).some((n) => /LinearGradient/.test(n.type));

function Mine({ preset }: { preset?: 'ocean' }) {
  const theme = useThemeDef(preset ? { preset } : {});
  return (
    <Bubble
      message={{ ...msg, senderId: 'me', status: 'sent' }}
      mine
      theme={theme}
      showSender={false}
      runStart
      runEnd
      onLongPress={jest.fn()}
      onRetry={jest.fn()}
      onOpenImage={jest.fn()}
      nameOf={() => 'You'}
    />
  );
}

const withHc = (children: ReactNode) => {
  mockStore.set(A11Y_STORAGE_KEY, JSON.stringify({ highContrast: true }));
  return <A11yProvider>{children}</A11yProvider>;
};

describe('outgoing bubbles in the looks', () => {
  afterEach(() => mockStore.clear());

  it('the Default theme draws the look gradient, and the tail takes its end stop', async () => {
    const { result } = await renderHook(() => useThemeDef({}));
    expect(result.current.fill.gradient).toBe(true);
    await render(<Mine />);
    expect(screen.getByTestId('gradient-fill', { includeHiddenElements: true })).toBeTruthy();
    expect(hasGradient()).toBe(true);
    // react-native-svg hands colours to native as ARGB integers.
    const argb = (hex: string) => (0xff000000 | parseInt(hex.slice(1, 7), 16)) >>> 0;
    const tailPath = hosts(screen.getByTestId('bubble-tail', { includeHiddenElements: true })).find(
      (n) => n.type === 'RNSVGPath',
    );
    expect((tailPath?.props.fill as { payload: number }).payload).toBe(
      argb(result.current.fill.to),
    );
    expect(result.current.outgoing).toBe(result.current.fill.to);
    expect(result.current.outgoingText).toBe(result.current.fill.text);
  });

  it('a named chat theme keeps its own colour, flat', async () => {
    await render(<Mine preset="ocean" />);
    expect(screen.queryByTestId('gradient-fill', { includeHiddenElements: true })).toBeNull();
    const flat = StyleSheet.flatten(screen.getByTestId('bubble').props.style);
    expect(flat.backgroundColor).toBe(chatThemeDefs.ocean!.bubble);
  });

  it('is flat under high contrast, whatever the theme', async () => {
    await render(withHc(<Mine />));
    await rtlAct(async () => undefined);
    expect(screen.queryByTestId('gradient-fill', { includeHiddenElements: true })).toBeNull();
    expect(hasGradient()).toBe(false);
    const flat = StyleSheet.flatten(screen.getByTestId('bubble').props.style);
    expect(flat.shadowOpacity ?? 0).toBe(0);
  });
});

describe('the chat glow', () => {
  afterEach(() => mockStore.clear());

  it('drifts in Aurora, pulses in Bloom and holds still in Velvet', () => {
    expect(glowMotion(themeFor('aurora', 'dark', false), false)).toBe('drift');
    expect(glowMotion(themeFor('bloom', 'light', false), false)).toBe('pulse');
    expect(glowMotion(themeFor('velvet', 'dark', false), false)).toBe('none');
  });

  it('holds still under reduced motion and is absent under high contrast', async () => {
    expect(glowMotion(themeFor('aurora', 'dark', false), true)).toBe('none');
    expect(glowMotion(themeFor('bloom', 'dark', false), true)).toBe('none');
    await render(
      <LookScope look="aurora">
        <ChatGlow />
      </LookScope>,
    );
    expect(screen.getByTestId('chat-glow', { includeHiddenElements: true })).toBeTruthy();
    await render(
      withHc(
        <LookScope look="aurora">
          <ChatGlow />
        </LookScope>,
      ),
    );
    await rtlAct(async () => undefined);
    expect(screen.queryByTestId('chat-glow', { includeHiddenElements: true })).toBeNull();
  });

  it('gives each glow its own gradient ids', async () => {
    await render(
      <LookScope look="bloom">
        <ChatGlow />
        <ChatGlow />
      </LookScope>,
    );
    const ids = hosts(screen.toJSON())
      .filter((n) => /RadialGradient/.test(n.type))
      .map((n) => n.props.name ?? n.props.id);
    expect(ids.length).toBeGreaterThan(1);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

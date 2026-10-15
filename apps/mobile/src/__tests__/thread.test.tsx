import type { LocalMessage } from '@vybora/e2ee';
import 'react-native-gesture-handler/jestSetup';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { Text as RNText } from 'react-native';
jest.mock('react-native-worklets', () => require('react-native-worklets/src/mock'));
jest.mock('react-native-reanimated', () => require('react-native-reanimated/mock'));
jest.mock('@/lib/supabase', () => ({
  supabase: {},
  supabaseConfig: { url: 'http://x', anonKey: 'k' },
}));
jest.mock('@/features/connect/ui/Attachment', () => ({
  ImageAttachment: () => null,
  VideoAttachment: () => null,
  VoiceAttachment: () => null,
  FileAttachment: () => null,
}));

import { Bubble } from '@/features/connect/ui/Bubble';
import { MessageActions } from '@/features/connect/ui/MessageActions';
import { SwipeToReply } from '@/features/connect/ui/SwipeToReply';
import { useThemeDef } from '@/features/connect/ui/primitives';
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

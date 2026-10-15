import type { LocalMessage } from '@vybora/e2ee';
import { fireEvent, render, screen } from '@testing-library/react-native';
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

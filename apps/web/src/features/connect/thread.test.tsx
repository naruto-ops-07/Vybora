import { resolveChatTheme } from '@vybora/config';
import type { LocalMessage } from '@vybora/e2ee';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { TooltipProvider } from '@/components/ui/Tooltip';
import { Bubble } from './Bubble';
import { DateChip, JumpToLatest, UnreadDivider } from './ThreadParts';

vi.mock('./ConnectProvider', () => ({ useConnect: () => ({ engine: null }) }));

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

function Harness(props: Partial<Parameters<typeof Bubble>[0]>) {
  const theme = { ...resolveChatTheme(null), accent: '#0F766E' };
  return (
    <TooltipProvider>
      <Bubble
        message={msg}
        mine={false}
        theme={theme}
        showSender={false}
        runStart
        runEnd
        myUserId="me"
        nameOf={(id) => (id === 'maya' ? 'Maya' : 'You')}
        onReact={vi.fn()}
        onReply={vi.fn()}
        onDelete={vi.fn()}
        onRetry={vi.fn()}
        onOpenImage={vi.fn()}
        onSelect={vi.fn()}
        {...props}
      />
    </TooltipProvider>
  );
}

describe('conversation layout', () => {
  it('reads each message as one item and draws a tail on the run end', () => {
    const { container } = render(<Harness />);
    const item = screen.getByRole('article');
    expect(item.getAttribute('aria-label')).toMatch(/^Maya, .+, See you at 7$/);
    expect(container.querySelector('[data-tail="true"]')).not.toBeNull();
  });

  it('omits the tail inside a run', () => {
    const { container } = render(<Harness runEnd={false} />);
    expect(container.querySelector('[data-tail="true"]')).toBeNull();
  });

  it('announces receipts on my messages', () => {
    render(<Harness message={{ ...msg, senderId: 'me', status: 'sent' }} mine receipt="read" />);
    expect(screen.getByRole('article').getAttribute('aria-label')).toMatch(/, read$/);
  });

  it('renders date chips and the unread divider as headings', () => {
    render(
      <>
        <DateChip label="Today" />
        <UnreadDivider count={3} />
        <JumpToLatest count={3} onClick={vi.fn()} />
      </>,
    );
    expect(screen.getByRole('heading', { name: 'Today' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '3 unread messages' })).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Jump to latest message, 3 new' }),
    ).toBeInTheDocument();
  });
});

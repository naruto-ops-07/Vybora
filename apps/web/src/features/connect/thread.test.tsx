import { resolveChatTheme } from '@vybora/config';
import type { ThreadItem } from '@vybora/core';
import type { LocalMessage } from '@vybora/e2ee';
import { act, fireEvent, render, renderHook, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { TooltipProvider } from '@/components/ui/Tooltip';
import { Bubble } from './Bubble';
import { useIncomingAnnouncement } from './announce';
import { threadKeyDown } from './threadKeys';
import { DateChip, groupByDay, JumpToLatest, UnreadDivider } from './ThreadParts';

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

  it('shows a checkbox in select mode and toggles on click', async () => {
    const onToggleSelect = vi.fn();
    render(<Harness selecting selected={false} onToggleSelect={onToggleSelect} />);
    await userEvent.click(screen.getByRole('checkbox', { name: 'Select message from Maya' }));
    expect(onToggleSelect).toHaveBeenCalledWith(expect.objectContaining({ id: 'm1' }));
  });

  it('does not act on the reply quote while selecting', async () => {
    const onToggleSelect = vi.fn();
    const onJumpTo = vi.fn();
    const replied = {
      ...msg,
      replyTo: { id: 'm0', senderId: 'me', preview: 'Earlier message' },
    };
    render(
      <Harness
        message={replied}
        selecting
        selected={false}
        onToggleSelect={onToggleSelect}
        onJumpTo={onJumpTo}
      />,
    );
    await userEvent.click(screen.getByText('Earlier message'));
    expect(onToggleSelect).toHaveBeenCalledWith(expect.objectContaining({ id: 'm1' }));
    expect(onJumpTo).not.toHaveBeenCalled();
  });

  it('marks the selected row without invalid article ARIA', () => {
    render(<Harness selecting selected onToggleSelect={vi.fn()} />);
    const row = screen.getByRole('article');
    expect(row).not.toHaveAttribute('aria-selected');
    expect(row).toHaveAttribute('data-selected', 'true');
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

describe('groupByDay', () => {
  it('starts a new group at each date chip', () => {
    const m = (id: string) => ({ id, senderId: 'maya', createdAt: '2026-10-15T10:00:00Z', seq: 1 });
    type Item = ThreadItem<ReturnType<typeof m>>;
    const msgItem = (id: string): Item => ({
      type: 'message',
      key: id,
      message: m(id),
      mine: false,
      runStart: true,
      runEnd: true,
    });
    const date = (day: string, label: string): Item => ({
      type: 'date',
      key: `date-${day}`,
      label,
      day,
    });
    const items: Item[] = [
      date('a', 'Yesterday'),
      msgItem('1'),
      msgItem('2'),
      date('b', 'Today'),
      { type: 'unread', key: 'unread', count: 1 },
      msgItem('3'),
    ];
    const groups = groupByDay(items);
    expect(groups.map((g) => [g.label, g.items.map((i) => i.key)])).toEqual([
      ['Yesterday', ['date-a', '1', '2']],
      ['Today', ['date-b', 'unread', '3']],
    ]);
  });
});

describe('new-message announcements', () => {
  const nameOf = (id: string) => (id === 'maya' ? 'Maya' : 'You');
  const base = { ready: true, userId: 'me', muted: false, conversationId: 'c1', nameOf };

  it('announces only messages that arrive after the chat loaded', () => {
    const first = { ...msg, id: 'a' };
    const { result, rerender } = renderHook(
      (p: { list: LocalMessage[] }) => useIncomingAnnouncement(p.list, base),
      { initialProps: { list: [first] } },
    );
    expect(result.current).toBe('');
    rerender({ list: [first, { ...msg, id: 'b', body: 'hello' }] });
    expect(result.current).toBe('Maya: hello');
  });

  it('stays quiet in muted chats and for my own messages', () => {
    const { result, rerender } = renderHook(
      (p: { list: LocalMessage[]; muted: boolean }) =>
        useIncomingAnnouncement(p.list, { ...base, muted: p.muted }),
      { initialProps: { list: [{ ...msg, id: 'a' }], muted: true } },
    );
    rerender({
      list: [
        { ...msg, id: 'a' },
        { ...msg, id: 'b' },
      ],
      muted: true,
    });
    expect(result.current).toBe('');
    rerender({
      list: [
        { ...msg, id: 'a' },
        { ...msg, id: 'b' },
        { ...msg, id: 'c', senderId: 'me' },
      ],
      muted: false,
    });
    expect(result.current).toBe('');
  });
});

describe('thread keyboard', () => {
  function setup() {
    const onReply = vi.fn();
    const onToggle = vi.fn();
    const { container } = render(
      <div onKeyDown={(e) => threadKeyDown(e, { onReply, onToggle })}>
        {['a', 'b', 'c'].map((id) => (
          <div key={id} data-message-id={id} tabIndex={-1}>
            {id}
          </div>
        ))}
      </div>,
    );
    const rows = [...container.querySelectorAll<HTMLElement>('[data-message-id]')];
    return { rows, onReply, onToggle };
  }

  it('moves between messages with arrow keys', () => {
    const { rows } = setup();
    act(() => rows[1]!.focus());
    fireEvent.keyDown(rows[1]!, { key: 'ArrowDown' });
    expect(document.activeElement).toBe(rows[2]);
    fireEvent.keyDown(rows[2]!, { key: 'ArrowUp' });
    expect(document.activeElement).toBe(rows[1]);
  });

  it('replies with R and toggles selection with Space', () => {
    const { rows, onReply, onToggle } = setup();
    act(() => rows[0]!.focus());
    fireEvent.keyDown(rows[0]!, { key: 'r' });
    expect(onReply).toHaveBeenCalledWith('a');
    fireEvent.keyDown(rows[0]!, { key: ' ' });
    expect(onToggle).toHaveBeenCalledWith('a');
  });

  it('opens the message menu with Enter', () => {
    const { rows } = setup();
    const onMenu = vi.fn();
    rows[0]!.addEventListener('contextmenu', onMenu);
    act(() => rows[0]!.focus());
    fireEvent.keyDown(rows[0]!, { key: 'Enter' });
    expect(onMenu).toHaveBeenCalled();
  });
});

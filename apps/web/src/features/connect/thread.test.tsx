import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { ChatTheme } from '@vybora/api';
import { looks, resolveChatTheme } from '@vybora/config';
import { A11Y_STORAGE_KEY, personTone, type ThreadItem } from '@vybora/core';
import type { LocalMessage } from '@vybora/e2ee';
import { act, cleanup, fireEvent, render, renderHook, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '@/test/utils';
import { TooltipProvider } from '@/components/ui/Tooltip';
import { Bubble } from './Bubble';
import { ChatGlow } from './Canvas';
import { useIncomingAnnouncement } from './announce';
import { threadKeyDown } from './threadKeys';
import { DateChip, groupByDay, JumpToLatest, ThreadDay, UnreadDivider } from './ThreadParts';
import { useChatTheme } from './ui';

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
  it('colours group sender names in the sender’s tone', () => {
    render(<Harness showSender senderName="Maya" />);
    const name = screen.getByText('Maya', { selector: '[data-sender-tone]' });
    const tone = personTone('maya');
    expect(name).toHaveAttribute('data-sender-tone', tone);
    expect(name.style.color).toBe(`var(--vy-tone-${tone}-name)`);
    expect(name).toHaveClass('font-semibold');
  });

  it('uses the theme text colour, bold, for sender names in high contrast', () => {
    const theme = { ...resolveChatTheme(null), accent: '#115E59', highContrast: true };
    render(<Harness showSender senderName="Maya" theme={theme} />);
    const name = screen.getByText('Maya', { selector: 'span' });
    expect(name).not.toHaveAttribute('data-sender-tone');
    expect(name.style.color).toBe('');
    expect(name).toHaveClass('font-bold', 'text-ink');
  });

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

  it('does not react or retry while selecting, toggling the message instead', async () => {
    const onToggleSelect = vi.fn();
    const onReact = vi.fn();
    const onRetry = vi.fn();
    render(
      <Harness
        message={{ ...msg, senderId: 'me', status: 'failed', reactions: { '👍': ['maya'] } }}
        mine
        receipt="failed"
        selecting
        selected={false}
        onToggleSelect={onToggleSelect}
        onReact={onReact}
        onRetry={onRetry}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: /^👍 1/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Not sent · Retry' }));
    expect(onReact).not.toHaveBeenCalled();
    expect(onRetry).not.toHaveBeenCalled();
    expect(onToggleSelect).toHaveBeenCalledTimes(2);
  });

  it('keeps the focused message mounted when select mode or its status changes', () => {
    const mine = { ...msg, senderId: 'me', status: 'sending' as const };
    const { rerender } = render(<Harness message={mine} mine receipt="sending" tabbable />);
    const row = screen.getByRole('article');
    act(() => row.focus());
    rerender(<Harness message={{ ...mine, status: 'sent' }} mine receipt="sent" tabbable />);
    expect(screen.getByRole('article')).toBe(row);
    rerender(
      <Harness
        message={{ ...mine, status: 'sent' }}
        mine
        receipt="sent"
        tabbable
        selecting
        onToggleSelect={vi.fn()}
      />,
    );
    expect(screen.getByRole('article')).toBe(row);
    rerender(<Harness message={{ ...mine, status: 'sent' }} mine receipt="sent" tabbable />);
    expect(screen.getByRole('article')).toBe(row);
    expect(document.activeElement).toBe(row);
  });

  it('marks the selected row without invalid article ARIA', () => {
    render(<Harness selecting selected onToggleSelect={vi.fn()} />);
    const row = screen.getByRole('article');
    expect(row).not.toHaveAttribute('aria-selected');
    expect(row).toHaveAttribute('data-selected', 'true');
  });

  it('groups a day without adding a landmark per day', () => {
    render(
      <>
        <ThreadDay>
          <DateChip label="Yesterday" />
        </ThreadDay>
        <ThreadDay>
          <DateChip label="Today" />
        </ThreadDay>
      </>,
    );
    expect(screen.queryAllByRole('region')).toEqual([]);
    expect(screen.getAllByRole('heading').map((h) => h.textContent)).toEqual([
      'Yesterday',
      'Today',
    ]);
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
    const first = { ...msg, id: 'a', seq: 1 };
    const { result, rerender } = renderHook(
      (p: { list: LocalMessage[] }) => useIncomingAnnouncement(p.list, base),
      { initialProps: { list: [first] } },
    );
    expect(result.current).toBe('');
    rerender({ list: [first, { ...msg, id: 'b', seq: 2, body: 'hello' }] });
    expect(result.current).toBe('Maya: hello');
  });

  it('does not re-announce an older message when the newest one expires', () => {
    const a = { ...msg, id: 'a', seq: 1, body: 'older' };
    const b = { ...msg, id: 'b', seq: 2, body: 'newest' };
    const { result, rerender } = renderHook(
      (p: { list: LocalMessage[] }) => useIncomingAnnouncement(p.list, base),
      { initialProps: { list: [a] } },
    );
    rerender({ list: [a, b] });
    expect(result.current).toBe('Maya: newest');
    rerender({ list: [a] });
    expect(result.current).toBe('Maya: newest');
    rerender({ list: [a, { ...msg, id: 'c', seq: 3, body: 'later' }] });
    expect(result.current).toBe('Maya: later');
  });

  it('stays quiet in muted chats and for my own messages', () => {
    const { result, rerender } = renderHook(
      (p: { list: LocalMessage[]; muted: boolean }) =>
        useIncomingAnnouncement(p.list, { ...base, muted: p.muted }),
      { initialProps: { list: [{ ...msg, id: 'a', seq: 1 }], muted: true } },
    );
    rerender({
      list: [
        { ...msg, id: 'a', seq: 1 },
        { ...msg, id: 'b', seq: 2 },
      ],
      muted: true,
    });
    expect(result.current).toBe('');
    rerender({
      list: [
        { ...msg, id: 'a', seq: 1 },
        { ...msg, id: 'b', seq: 2 },
        { ...msg, id: 'c', seq: 3, senderId: 'me' },
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

describe('bubbles and canvas in the new looks', () => {
  const html = document.documentElement;
  const css = ['styles/workspace.css'].map((f) =>
    readFileSync(resolve(process.cwd(), 'src', f), 'utf8'),
  );
  let sheet: HTMLStyleElement;
  beforeAll(() => {
    sheet = document.createElement('style');
    sheet.textContent = css.join('\n');
    document.head.append(sheet);
  });
  afterAll(() => sheet.remove());
  beforeEach(() => {
    html.dataset.look = 'velvet';
    html.dataset.theme = 'dark';
  });
  afterEach(() => {
    cleanup();
    delete html.dataset.look;
    delete html.dataset.theme;
    delete html.dataset.contrast;
    localStorage.clear();
  });

  function Themed({ chatTheme }: { chatTheme: ChatTheme }) {
    const theme = useChatTheme(chatTheme);
    return <Harness mine theme={theme} />;
  }
  const outgoing = (chatTheme: ChatTheme) => {
    const { container } = renderWithProviders(<Themed chatTheme={chatTheme} />);
    return container.querySelector<HTMLElement>('[data-bubble="out"]')!;
  };

  it('Velvet: a Default-theme outgoing bubble is the look’s gradient, its tail the end stop', () => {
    const bubble = outgoing({});
    const t = looks.velvet.modes.dark;
    const style = getComputedStyle(bubble);
    expect(style.backgroundImage).toContain('linear-gradient');
    expect(style.backgroundImage.toLowerCase()).toContain(t.bubbleOutFrom.toLowerCase());
    expect(bubble.className).toContain('shadow-1');
    const tail = bubble.querySelector('[data-tail="true"] path')!;
    expect(tail.getAttribute('fill')?.toLowerCase()).toBe(t.bubbleOutTo.toLowerCase());
  });

  it('a named chat theme (ocean) keeps its own colour, flat, with the look’s depth', () => {
    const bubble = outgoing({ preset: 'ocean' });
    const style = getComputedStyle(bubble);
    expect(style.backgroundImage === '' || style.backgroundImage === 'none').toBe(true);
    expect(style.backgroundColor).toBe('rgb(29, 78, 216)');
    expect(bubble.className).toContain('shadow-1');
  });

  it('under high contrast the outgoing bubble is flat', () => {
    localStorage.setItem(A11Y_STORAGE_KEY, JSON.stringify({ highContrast: true }));
    html.dataset.contrast = 'high';
    const bubble = outgoing({});
    const style = getComputedStyle(bubble);
    expect(style.backgroundImage === '' || style.backgroundImage === 'none').toBe(true);
  });

  it('incoming bubbles are the look’s bubble-in with elevation 1', () => {
    const { container } = render(<Harness />);
    const bubble = container.querySelector<HTMLElement>('[data-bubble="in"]')!;
    expect(bubble).toHaveClass('vy-bubble-in');
    expect(getComputedStyle(bubble).boxShadow).toBe('var(--vy-shadow-1)');
  });

  it('Aurora’s glow drifts; reduced motion stills it; high contrast removes it', () => {
    html.dataset.look = 'aurora';
    const { container, unmount } = renderWithProviders(<ChatGlow />);
    const glow = container.querySelector<HTMLElement>('[data-chat-glow]')!;
    expect(glow).toHaveAttribute('aria-hidden', 'true');
    expect(glow.dataset.ambient).toBe('drift');
    expect(getComputedStyle(glow).animationName).toBe('vy-glow-drift');
    expect(getComputedStyle(glow).pointerEvents).toBe('none');
    unmount();

    localStorage.setItem(A11Y_STORAGE_KEY, JSON.stringify({ reduceMotion: 'on' }));
    const still = renderWithProviders(<ChatGlow />);
    const stillGlow = still.container.querySelector<HTMLElement>('[data-chat-glow]')!;
    expect(stillGlow.dataset.ambient).toBe('none');
    expect(['', 'none']).toContain(getComputedStyle(stillGlow).animationName);
    still.unmount();

    localStorage.setItem(A11Y_STORAGE_KEY, JSON.stringify({ highContrast: true }));
    const flat = renderWithProviders(<ChatGlow />);
    expect(flat.container.querySelector('[data-chat-glow]')).toBeNull();
  });

  it('Bloom pulses, Velvet holds still', () => {
    html.dataset.look = 'bloom';
    const bloom = renderWithProviders(<ChatGlow />);
    const glow = bloom.container.querySelector<HTMLElement>('[data-chat-glow]')!;
    expect(glow.dataset.ambient).toBe('pulse');
    expect(getComputedStyle(glow).animationName).toBe('vy-glow-pulse');
    bloom.unmount();
    html.dataset.look = 'velvet';
    const velvet = renderWithProviders(<ChatGlow />);
    const still = velvet.container.querySelector<HTMLElement>('[data-chat-glow]')!;
    expect(still.dataset.ambient).toBe('none');
    expect(['', 'none']).toContain(getComputedStyle(still).animationName);
  });
});

import { resolveChatTheme } from '@vybora/config';
import type { LocalMessage } from '@vybora/e2ee';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useEffect } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { TooltipProvider } from '@/components/ui/Tooltip';
import { Bubble } from './Bubble';
import { MessageResults } from './search/MessageResults';
import { SearchBar } from './search/SearchBar';
import { useChatSearch } from './search/useChatSearch';

vi.mock('./ConnectProvider', () => ({ useConnect: () => ({ engine: null }) }));

const msg = (id: string, body: string, seq: number): LocalMessage => ({
  id,
  conversationId: 'c1',
  seq,
  senderId: 'maya',
  senderDeviceId: null,
  createdAt: `2026-10-2${seq}T10:00:00Z`,
  expiresAt: null,
  status: 'received',
  kind: 'text',
  body,
  reactions: {},
});

const messages = [
  msg('m1', 'Café at noon?', 1),
  msg('m2', 'The cafe on the corner', 2),
  msg('m3', 'See you there', 3),
];

function Harness({ onJump = vi.fn() }: { onJump?: (id: string) => void }) {
  const search = useChatSearch({
    load: async () => messages,
    nameOf: (id) => id,
    onJump,
  });
  const { open } = search;
  useEffect(() => open(), [open]);
  return (
    <>
      <SearchBar {...search.bar} />
      <p data-testid="current">{search.current ?? 'none'}</p>
    </>
  );
}

describe('in-chat search', () => {
  it('waits for typing to settle, then counts and steps through the hits', async () => {
    const onJump = vi.fn();
    render(<Harness onJump={onJump} />);
    const box = screen.getByRole('searchbox', { name: 'Search this chat' });
    await userEvent.type(box, 'cafe');
    // Debounced: nothing has run yet.
    expect(screen.queryByText('1 of 2')).toBeNull();
    await waitFor(() => expect(screen.getByText('1 of 2')).toBeInTheDocument());
    // Newest first, and the accent is ignored.
    expect(onJump).toHaveBeenLastCalledWith('m2');
    expect(screen.getByTestId('current')).toHaveTextContent('m2');
    await userEvent.click(screen.getByRole('button', { name: 'Older result' }));
    expect(screen.getByText('2 of 2')).toBeInTheDocument();
    expect(onJump).toHaveBeenLastCalledWith('m1');
    await userEvent.click(screen.getByRole('button', { name: 'Newer result' }));
    expect(screen.getByText('1 of 2')).toBeInTheDocument();
  });

  it('says when nothing matched, and that search is on this device', async () => {
    render(<Harness />);
    await userEvent.type(screen.getByRole('searchbox', { name: 'Search this chat' }), 'zzz');
    expect(await screen.findByText('No matches')).toBeInTheDocument();
    expect(screen.getByText('Searches messages on this device.')).toBeInTheDocument();
  });

  it('steps with Enter and closes with Escape', async () => {
    const onJump = vi.fn();
    render(<Harness onJump={onJump} />);
    const box = screen.getByRole('searchbox', { name: 'Search this chat' });
    await userEvent.type(box, 'cafe');
    await waitFor(() => expect(screen.getByText('1 of 2')).toBeInTheDocument());
    await userEvent.type(box, '{Enter}');
    expect(screen.getByText('2 of 2')).toBeInTheDocument();
    await userEvent.type(box, '{Shift>}{Enter}{/Shift}');
    expect(screen.getByText('1 of 2')).toBeInTheDocument();
    await userEvent.type(box, '{Escape}');
    expect(screen.queryByRole('searchbox')).toBeNull();
  });
});

describe('a bubble on the current hit', () => {
  it('marks every match and says it is the current result', () => {
    render(
      <TooltipProvider>
        <Bubble
          message={msg('m2', 'The cafe on the corner cafe', 2)}
          mine={false}
          theme={{ ...resolveChatTheme(null), accent: '#0F766E' }}
          showSender={false}
          runStart
          runEnd
          myUserId="me"
          nameOf={(id) => id}
          onReact={vi.fn()}
          onReply={vi.fn()}
          onDelete={vi.fn()}
          onRetry={vi.fn()}
          onOpenImage={vi.fn()}
          onSelect={vi.fn()}
          match="cafe"
          currentMatch
        />
      </TooltipProvider>,
    );
    const marks = screen.getAllByText('cafe', { selector: 'mark' });
    expect(marks).toHaveLength(2);
    expect(marks[0]).toHaveAttribute('data-current', 'true');
    expect(screen.getByRole('article').getAttribute('aria-label')).toContain('current result');
  });
});

describe('messages across chats', () => {
  const hits = [
    {
      message: { ...msg('m2', 'The cafe on the corner', 2), conversationId: 'c2' },
      chat: 'Weekend crew',
      sender: 'Maya',
      text: 'The cafe on the corner',
      ranges: [[4, 8]] as [number, number][],
    },
  ];

  it('lists a snippet with the match marked and opens the message', async () => {
    const onOpen = vi.fn();
    render(<MessageResults hits={hits} loading={false} term="cafe" onOpen={onOpen} />);
    const list = screen.getByRole('list', { name: 'Messages' });
    expect(within(list).getByText('cafe', { selector: 'mark' })).toBeInTheDocument();
    expect(within(list).getByText(/Maya in Weekend crew/)).toBeInTheDocument();
    await userEvent.click(within(list).getAllByRole('button')[0]!);
    expect(onOpen).toHaveBeenCalledWith(expect.objectContaining({ id: 'm2' }));
  });

  it('says plainly when a search finds no messages', () => {
    render(<MessageResults hits={[]} loading={false} term="zzz" onOpen={vi.fn()} />);
    expect(screen.getByText('No messages match “zzz”')).toBeInTheDocument();
  });

  it('shows nothing at all before a search', () => {
    const { container } = render(
      <MessageResults hits={[]} loading={false} term="" onOpen={vi.fn()} />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});

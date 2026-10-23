import type { ConnectMember } from '@vybora/api';
import type { LocalMessage } from '@vybora/e2ee';
import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { StrictMode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { TooltipProvider } from '@/components/ui/Tooltip';
import { Composer } from './Composer';
import { controlErrorText } from './controlErrors';
import { ForwardDialog } from './ForwardDialog';
import { MessageInfoDialog } from './MessageInfoDialog';
import { MessageMenu } from './MessageMenu';
import { PinBar } from './PinBar';
import { StarredDialog } from './StarredDialog';
import { setThreadIntent, takeThreadIntent } from './threadIntents';

vi.mock('./ConnectProvider', () => ({ useConnect: () => ({ engine: null }) }));

const msg = (over: Partial<LocalMessage> = {}): LocalMessage => ({
  id: 'm1',
  conversationId: 'c1',
  seq: 5,
  senderId: 'me',
  senderDeviceId: 'd1',
  createdAt: '2026-10-22T10:00:00Z',
  expiresAt: null,
  status: 'sent',
  kind: 'text',
  body: 'See you at 7',
  reactions: {},
  ...over,
});

describe('message menu, full set', () => {
  it('names every action and keeps delete apart', async () => {
    const onAction = vi.fn();
    render(
      <MessageMenu
        actions={[
          'reply',
          'replyPrivately',
          'copy',
          'edit',
          'forward',
          'star',
          'pin',
          'info',
          'select',
          'delete',
        ]}
        myReactions={[]}
        onReact={vi.fn()}
        onAction={onAction}
      >
        <div>Bubble</div>
      </MessageMenu>,
    );
    fireEvent.contextMenu(screen.getByText('Bubble'));
    for (const name of [
      'Reply',
      'Reply privately',
      'Copy text',
      'Edit',
      'Forward',
      'Star',
      'Pin',
      'Message info',
      'Select',
      'Delete for everyone',
    ])
      expect(await screen.findByRole('menuitem', { name })).toBeInTheDocument();
    expect(screen.getByRole('menu').querySelector('[role="separator"]')).not.toBeNull();
    await userEvent.click(screen.getByRole('menuitem', { name: 'Forward' }));
    expect(onAction).toHaveBeenCalledWith('forward');
  });
});

describe('composer edit mode', () => {
  const props = {
    accent: '#0F766E',
    replyTo: null,
    onCancelReply: vi.fn(),
    onFiles: vi.fn(),
    onTyping: vi.fn(),
  };

  it('fills in the message, saves with Enter and never sends a new one', async () => {
    const onSend = vi.fn();
    const onEdit = vi.fn(async () => true);
    render(
      <Composer
        {...props}
        draftKey="e1"
        onSend={onSend}
        editing={{ id: 'm1', text: 'See you at 7' }}
        onEdit={onEdit}
        onCancelEdit={vi.fn()}
      />,
      { wrapper: TooltipProvider },
    );
    expect(screen.getByText('Editing message')).toBeInTheDocument();
    const box = screen.getByRole('textbox', { name: 'Edit message' });
    expect(box).toHaveValue('See you at 7');
    await userEvent.clear(box);
    await userEvent.type(box, 'See you at 8{Enter}');
    expect(onEdit).toHaveBeenCalledWith('See you at 8');
    expect(onSend).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Save edit' })).toBeInTheDocument();
  });

  it('starts in edit mode under StrictMode (effects run twice)', () => {
    render(
      <StrictMode>
        <Composer
          {...props}
          draftKey="e3"
          onSend={vi.fn()}
          editing={{ id: 'm1', text: 'Still here' }}
          onEdit={vi.fn()}
          onCancelEdit={vi.fn()}
        />
      </StrictMode>,
      { wrapper: TooltipProvider },
    );
    expect(screen.getByRole('textbox', { name: 'Edit message' })).toHaveValue('Still here');
  });

  it('cancels with Esc and gives back the draft that was there', async () => {
    const onCancelEdit = vi.fn();
    const { rerender } = render(
      <Composer {...props} draftKey="e2" onSend={vi.fn()} onCancelEdit={onCancelEdit} />,
      { wrapper: TooltipProvider },
    );
    await userEvent.type(screen.getByRole('textbox', { name: 'Message' }), 'half a thought');
    rerender(
      <Composer
        {...props}
        draftKey="e2"
        onSend={vi.fn()}
        editing={{ id: 'm1', text: 'Old words' }}
        onEdit={vi.fn()}
        onCancelEdit={onCancelEdit}
      />,
    );
    const box = screen.getByRole('textbox', { name: 'Edit message' });
    expect(box).toHaveValue('Old words');
    await userEvent.type(box, '{Escape}');
    expect(onCancelEdit).toHaveBeenCalled();
    rerender(<Composer {...props} draftKey="e2" onSend={vi.fn()} onCancelEdit={onCancelEdit} />);
    expect(screen.getByRole('textbox', { name: 'Message' })).toHaveValue('half a thought');
  });
});

describe('forward dialog', () => {
  const chats = [
    { id: 'c1', title: 'Maya', avatar: null },
    { id: 'c2', title: 'Weekend crew', avatar: null },
    { id: 'c3', title: 'Leo', avatar: null },
  ];

  it('searches, picks several chats and forwards to each', async () => {
    const onForward = vi.fn(async () => undefined);
    render(<ForwardDialog open chats={chats} onClose={vi.fn()} onForward={onForward} />);
    const send = screen.getByRole('button', { name: /^Forward/ });
    expect(send).toBeDisabled();
    await userEvent.type(screen.getByRole('searchbox', { name: 'Search chats' }), 'wee');
    expect(screen.queryByRole('checkbox', { name: 'Maya' })).toBeNull();
    await userEvent.click(screen.getByRole('checkbox', { name: 'Weekend crew' }));
    await userEvent.clear(screen.getByRole('searchbox', { name: 'Search chats' }));
    await userEvent.click(screen.getByRole('checkbox', { name: 'Leo' }));
    expect(screen.getByRole('checkbox', { name: 'Leo' })).toHaveAttribute('aria-checked', 'true');
    await userEvent.click(screen.getByRole('button', { name: 'Forward to 2 chats' }));
    expect(onForward).toHaveBeenCalledWith(['c2', 'c3']);
  });

  it('says so when no chat matches', async () => {
    render(<ForwardDialog open chats={chats} onClose={vi.fn()} onForward={vi.fn()} />);
    await userEvent.type(screen.getByRole('searchbox', { name: 'Search chats' }), 'zzz');
    expect(screen.getByText('No chats match')).toBeInTheDocument();
  });
});

describe('pin bar', () => {
  const pins = [
    { messageId: 'a', summary: 'Oldest pin' },
    { messageId: 'b', summary: 'Middle pin' },
    { messageId: 'c', summary: 'Newest pin' },
  ];

  it('shows the newest pin and cycles to older ones, jumping to each', async () => {
    const onShow = vi.fn();
    render(<PinBar pins={pins} onShow={onShow} accent="#0F766E" />);
    const bar = screen.getByRole('button', { name: /^Pinned message 1 of 3: Newest pin/ });
    await userEvent.click(bar);
    expect(onShow).toHaveBeenLastCalledWith('c');
    expect(screen.getByRole('button', { name: /^Pinned message 2 of 3: Middle pin/ }));
    await userEvent.click(screen.getByRole('button', { name: /Middle pin/ }));
    expect(onShow).toHaveBeenLastCalledWith('b');
    await userEvent.click(screen.getByRole('button', { name: /Oldest pin/ }));
    expect(onShow).toHaveBeenLastCalledWith('a');
    expect(screen.getByRole('button', { name: /Newest pin/ })).toBeInTheDocument();
  });

  it('works from the keyboard', async () => {
    const onShow = vi.fn();
    render(<PinBar pins={pins.slice(0, 1)} onShow={onShow} accent="#0F766E" />);
    await userEvent.tab();
    expect(screen.getByRole('button', { name: /^Pinned message: Oldest pin/ })).toHaveFocus();
    await userEvent.keyboard('{Enter}');
    expect(onShow).toHaveBeenCalledWith('a');
  });

  it('renders nothing with no pins', () => {
    const { container } = render(<PinBar pins={[]} onShow={vi.fn()} accent="#000" />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe('message info', () => {
  const member = (id: string, username: string, read: number, delivered: number) =>
    ({
      id,
      username,
      display_name: username,
      avatar_path: null,
      role: 'member',
      read_seq: read,
      delivered_seq: delivered,
    }) as ConnectMember;

  it('lists who read it, who has it and who it is waiting on', () => {
    render(
      <MessageInfoDialog
        open
        onClose={vi.fn()}
        message={msg({ seq: 5 })}
        members={[
          member('me', 'me', 9, 9),
          member('maya', 'Maya', 5, 5),
          member('leo', 'Leo', 2, 6),
          member('rin', 'Rin', 1, 1),
        ]}
        nameOf={(id) => ({ maya: 'Maya', leo: 'Leo', rin: 'Rin' })[id] ?? 'You'}
      />,
    );
    const dialog = screen.getByRole('dialog', { name: 'Message info' });
    const read = within(dialog).getByRole('region', { name: 'Read' });
    expect(within(read).getByText('Maya')).toBeInTheDocument();
    expect(
      within(within(dialog).getByRole('region', { name: 'Delivered' })).getByText('Leo'),
    ).toBeInTheDocument();
    expect(
      within(within(dialog).getByRole('region', { name: 'Waiting' })).getByText('Rin'),
    ).toBeInTheDocument();
    expect(within(dialog).queryByText('You')).toBeNull();
  });
});

describe('starred messages', () => {
  it('lists starred messages and opens the one picked', async () => {
    const onOpen = vi.fn();
    const items = [
      msg({ id: 's1', body: 'Train at 9:40', starred: true }),
      msg({
        id: 's2',
        conversationId: 'c2',
        kind: 'poll',
        body: undefined,
        starred: true,
        poll: { question: 'Dinner?', options: ['Yes', 'No'], multi: false, votes: {} },
      }),
    ];
    render(
      <StarredDialog
        open
        onClose={vi.fn()}
        scope="all"
        loading={false}
        messages={items}
        describe={(m) => ({
          chat: m.conversationId === 'c1' ? 'Maya' : 'Weekend crew',
          sender: 'You',
          nameOf: () => 'Someone',
        })}
        onOpen={onOpen}
      />,
    );
    const dialog = screen.getByRole('dialog', { name: 'Starred messages' });
    expect(within(dialog).getByText('Train at 9:40')).toBeInTheDocument();
    expect(within(dialog).getByText('Poll: Dinner?')).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole('button', { name: /Train at 9:40/ }));
    expect(onOpen).toHaveBeenCalledWith(expect.objectContaining({ id: 's1' }));
  });

  it('explains how to star when there is nothing yet', () => {
    render(
      <StarredDialog
        open
        onClose={vi.fn()}
        scope="chat"
        loading={false}
        messages={[]}
        describe={() => ({ chat: '', sender: '', nameOf: () => '' })}
        onOpen={vi.fn()}
      />,
    );
    expect(screen.getByText('No starred messages')).toBeInTheDocument();
  });
});

describe('thread intents', () => {
  it('holds one intent per chat until it is taken', () => {
    setThreadIntent('c9', { jumpTo: 'm3' });
    expect(takeThreadIntent('c9')).toEqual({ jumpTo: 'm3' });
    expect(takeThreadIntent('c9')).toBeNull();
  });
});

describe('action errors', () => {
  const err = (code: string, message?: string) =>
    Object.assign(new Error(message ?? code), { code });

  it('says plainly when the rules refused it', () => {
    expect(controlErrorText('edit', err('forbidden', 'edit_not_allowed'))).toBe(
      'This message can no longer be edited',
    );
    expect(controlErrorText('pin', err('forbidden', 'pin_not_allowed'))).toBe(
      'This message can’t be pinned right now',
    );
    expect(controlErrorText('vote', err('forbidden', 'vote_not_allowed'))).toBe(
      'This poll didn’t take your vote',
    );
  });

  it('says a stored control will retry, and a failed delete will not', () => {
    expect(controlErrorText('reaction', err('network'))).toBe('Couldn’t send yet. It will retry.');
    expect(controlErrorText('edit', err('unknown'))).toBe('Couldn’t send yet. It will retry.');
    expect(controlErrorText('delete', err('network'))).toBe(
      'Couldn’t delete for everyone. Check your connection and try again.',
    );
  });
});

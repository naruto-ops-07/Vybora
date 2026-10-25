import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes, useLocation } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '@/test/utils';
import { CommandPalette } from './CommandPalette';
import { takeThreadIntent } from './threadIntents';

vi.mock('@/features/auth/AuthProvider', () => ({ useMe: () => ({ userId: 'me' }) }));
const connect = vi.hoisted(() => ({ engine: null as unknown }));
vi.mock('./ConnectProvider', () => ({ useConnect: () => ({ engine: connect.engine }) }));
vi.mock('./hooks', () => ({
  conversationTitle: () => 'Chat',
  useNicknames: () => ({ data: {} }),
  useSecureInbox: () => ({ data: [] }),
}));

describe('command palette', () => {
  it('lists the thread keyboard shortcuts as non-actionable items', () => {
    renderWithProviders(<CommandPalette open onOpenChange={vi.fn()} onNewChat={vi.fn()} />);
    const group = screen.getByRole('group', { name: 'Keyboard shortcuts' });
    const items = within(group).getAllByRole('option');
    expect(items.map((i) => i.textContent)).toEqual([
      'Move between messages↑ ↓',
      'Open the message menu (also Shift F10)Enter',
      'Reply to the focused messageR',
      'Select or deselect a message in select modeSpace',
      'Close or go backEsc',
      'New messageAlt N',
      'Chat detailsAlt I',
      'Previous or next chatAlt ↑ ↓',
      'Command menuCtrl/⌘ K',
    ]);
    items.forEach((i) => expect(i).toHaveAttribute('aria-disabled', 'true'));
  });
});

describe('command palette: add a friend', () => {
  function Probe() {
    const location = useLocation();
    return <p>{`${location.pathname} ${JSON.stringify(location.state)}`}</p>;
  }

  it('goes to Friends and asks for the username field to be focused', async () => {
    const onOpenChange = vi.fn();
    renderWithProviders(
      <>
        <CommandPalette open onOpenChange={onOpenChange} onNewChat={vi.fn()} />
        <Routes>
          <Route path="*" element={<Probe />} />
        </Routes>
      </>,
    );
    await userEvent.click(screen.getByRole('option', { name: 'Add a friend' }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(screen.getByText('/friends {"focusAddFriend":true}')).toBeInTheDocument();
  });
});

describe('command palette: appearance', () => {
  function Probe() {
    return <p>{useLocation().pathname}</p>;
  }

  it('has one Appearance… item that opens Settings → Appearance', async () => {
    renderWithProviders(
      <>
        <CommandPalette open onOpenChange={vi.fn()} onNewChat={vi.fn()} />
        <Routes>
          <Route path="*" element={<Probe />} />
        </Routes>
      </>,
    );
    expect(screen.queryByRole('option', { name: /theme/i })).toBeNull();
    await userEvent.click(screen.getByRole('option', { name: 'Appearance…' }));
    expect(screen.getByText('/settings/appearance')).toBeInTheDocument();
  });
});

describe('command palette: messages', () => {
  it('offers matching messages and opens the chat at the one picked', async () => {
    const engine = {
      queryMessages: vi.fn(async () => [
        {
          id: 'm9',
          conversationId: 'c9',
          seq: 2,
          senderId: 'leo',
          senderDeviceId: null,
          createdAt: '2026-10-22T09:00:00Z',
          expiresAt: null,
          status: 'received',
          kind: 'text',
          body: 'The cafe on the corner',
          reactions: {},
        },
      ]),
    };
    connect.engine = engine as never;
    renderWithProviders(<CommandPalette open onOpenChange={vi.fn()} onNewChat={vi.fn()} />);
    await userEvent.type(screen.getByRole('combobox'), 'cafe');
    const group = await screen.findByRole('group', { name: 'Messages' });
    expect(within(group).getByText('cafe', { selector: 'mark' })).toBeInTheDocument();
    await userEvent.click(within(group).getAllByRole('option')[0]!);
    expect(takeThreadIntent('c9')).toEqual({ jumpTo: 'm9' });
    connect.engine = null;
  });
});

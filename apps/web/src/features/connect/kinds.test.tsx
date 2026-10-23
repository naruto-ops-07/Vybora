import { resolveChatTheme } from '@vybora/config';
import { personTone, UNSUPPORTED_TEXT } from '@vybora/core';
import type { LocalMessage } from '@vybora/e2ee';
import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TooltipProvider } from '@/components/ui/Tooltip';
import { Bubble } from './Bubble';
import { MessageKindsProvider, type ContactState, type MessageKinds } from './kinds/context';
import { ViewOnceViewer } from './kinds/ViewOnce';

vi.mock('./ConnectProvider', () => ({ useConnect: () => ({ engine: null }) }));

const MAYA = '11111111-1111-4111-8111-111111111111';
const LEO = '22222222-2222-4222-8222-222222222222';
const ME = '33333333-3333-4333-8333-333333333333';
const STRANGER = '44444444-4444-4444-8444-444444444444';

const base: LocalMessage = {
  id: 'm1',
  conversationId: 'c1',
  seq: 3,
  senderId: MAYA,
  senderDeviceId: 'd1',
  createdAt: '2026-10-22T10:00:00Z',
  expiresAt: null,
  status: 'received',
  kind: 'text',
  body: 'Hello',
  reactions: {},
};

const names: Record<string, string> = { [MAYA]: 'Maya', [LEO]: 'Leo', [ME]: 'You' };

function kinds(over: Partial<MessageKinds> = {}): MessageKinds {
  return {
    isGroup: false,
    useContact: () => ({ status: 'missing' }),
    onMessageContact: vi.fn(),
    onAddFriend: vi.fn(),
    onVote: vi.fn(async () => true),
    onOpenViewOnce: vi.fn(),
    ...over,
  };
}

function renderBubble(
  m: Partial<LocalMessage>,
  {
    mine = false,
    value = kinds(),
    highContrast = false,
    busy = false,
  }: { mine?: boolean; value?: MessageKinds; highContrast?: boolean; busy?: boolean } = {},
) {
  const theme = { ...resolveChatTheme(null), accent: '#0F766E', highContrast };
  return render(
    <TooltipProvider>
      <MessageKindsProvider value={value}>
        <Bubble
          message={{ ...base, ...m }}
          mine={mine}
          theme={theme}
          showSender={false}
          runStart
          runEnd
          myUserId={ME}
          nameOf={(id) => names[id] ?? 'Someone'}
          onReact={vi.fn()}
          onReply={vi.fn()}
          onDelete={vi.fn()}
          onRetry={vi.fn()}
          onOpenImage={vi.fn()}
          onSelect={vi.fn()}
          busy={busy}
        />
      </MessageKindsProvider>
    </TooltipProvider>,
  );
}

afterEach(() => vi.restoreAllMocks());

describe('unsupported messages', () => {
  it('shows the update text in a quiet bubble', () => {
    renderBubble({ kind: 'unsupported', body: undefined });
    expect(screen.getByText(UNSUPPORTED_TEXT)).toBeInTheDocument();
    expect(screen.getByRole('article').getAttribute('aria-label')).toContain(UNSUPPORTED_TEXT);
  });
});

describe('contact cards', () => {
  const card = {
    kind: 'contact' as const,
    body: undefined,
    contact: { userId: STRANGER, username: 'spoofed', displayName: 'Your Bank' },
  };
  const found = (relation: Extract<ContactState, { status: 'found' }>['relation']) =>
    ({
      status: 'found',
      relation,
      profile: { id: STRANGER, username: 'rin', displayName: 'Rin Okada', avatarPath: null },
    }) as const;

  it('names the person from the server profile, never from the card', () => {
    const useContact = vi.fn(() => found('none'));
    renderBubble(card, { value: kinds({ useContact }) });
    expect(useContact).toHaveBeenCalledWith(STRANGER);
    expect(screen.getByText('Rin Okada')).toBeInTheDocument();
    expect(screen.getByText('@rin')).toBeInTheDocument();
    expect(screen.queryByText(/Your Bank/)).toBeNull();
    expect(screen.queryByText(/spoofed/)).toBeNull();
    expect(screen.getByRole('article').getAttribute('aria-label')).not.toContain('Your Bank');
  });

  it('shows a skeleton while the profile loads', () => {
    renderBubble(card, { value: kinds({ useContact: () => ({ status: 'loading' }) }) });
    expect(screen.getByLabelText('Loading contact')).toBeInTheDocument();
    expect(screen.queryByText(/Your Bank/)).toBeNull();
  });

  it('says "VYBORA user" with no name or buttons when no profile is found', () => {
    renderBubble(card);
    expect(screen.getByText('VYBORA user')).toBeInTheDocument();
    expect(screen.queryByText(/spoofed|Your Bank/)).toBeNull();
    expect(screen.queryByRole('button', { name: /Message|Add friend/ })).toBeNull();
  });

  it('messages and adds the resolved person by id', async () => {
    const value = kinds({ useContact: () => found('none') });
    renderBubble(card, { value });
    await userEvent.click(screen.getByRole('button', { name: 'Message Rin Okada' }));
    expect(value.onMessageContact).toHaveBeenCalledWith(
      expect.objectContaining({ id: STRANGER, username: 'rin' }),
    );
    await userEvent.click(screen.getByRole('button', { name: 'Add Rin Okada as a friend' }));
    expect(value.onAddFriend).toHaveBeenCalledWith(
      expect.objectContaining({ id: STRANGER, username: 'rin' }),
    );
  });

  it('shows friendship state instead of the add button', () => {
    const { unmount } = renderBubble(card, {
      value: kinds({ useContact: () => found('friends') }),
    });
    expect(screen.getByText('Friends')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Add .* as a friend/ })).toBeNull();
    unmount();
    renderBubble(card, { value: kinds({ useContact: () => found('outgoing') }) });
    expect(screen.getByText('Request sent')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Add .* as a friend/ })).toBeNull();
  });

  it('offers nothing to do for my own card', () => {
    renderBubble(card, { value: kinds({ useContact: () => found('self') }) });
    expect(screen.queryByRole('button', { name: /Message|Add/ })).toBeNull();
  });
});

describe('location cards', () => {
  it('draws the place with no map request and links out on purpose', () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const { container } = renderBubble({
      kind: 'location',
      body: undefined,
      location: { lat: 51.5073509, lng: -0.1277583, label: 'Trafalgar Square' },
    });
    expect(screen.getByText('Trafalgar Square')).toBeInTheDocument();
    const link = screen.getByRole('link', { name: /Open in Maps/ });
    expect(link).toHaveAttribute(
      'href',
      'https://www.openstreetmap.org/?mlat=51.50735&mlon=-0.12776#map=16/51.50735/-0.12776',
    );
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    expect(screen.getByText(/opens openstreetmap\.org/i)).toBeInTheDocument();
    expect(container.querySelector('img, iframe')).toBeNull();
    expect(container.querySelector('svg[data-location-art]')).not.toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('shows coordinates when there is no label', () => {
    renderBubble({ kind: 'location', body: undefined, location: { lat: 1.234567, lng: 2.5 } });
    expect(screen.getByText('1.23457, 2.50000')).toBeInTheDocument();
  });
});

describe('polls', () => {
  const poll = (multi: boolean, votes: Record<string, number[]> = {}) => ({
    kind: 'poll' as const,
    body: undefined,
    poll: { question: 'Where to?', options: ['Beach', 'Hills', 'Home'], multi, votes },
  });

  it('is a radio group for single choice, with tallies and a vote count', () => {
    renderBubble(poll(false, { [MAYA]: [0], [LEO]: [0], [ME]: [1] }));
    const group = screen.getByRole('radiogroup', { name: 'Where to?' });
    const radios = within(group).getAllByRole('radio');
    expect(radios).toHaveLength(3);
    expect(radios[1]).toHaveAttribute('aria-checked', 'true');
    expect(radios[0]).toHaveAccessibleName(/Beach, 2 votes/);
    expect(screen.getByText('3 votes')).toBeInTheDocument();
  });

  it('uses checkboxes for multiple choice', () => {
    renderBubble(poll(true));
    expect(screen.getByRole('group', { name: 'Where to?' })).toBeInTheDocument();
    expect(screen.getAllByRole('checkbox')).toHaveLength(3);
    expect(screen.getByText('No votes yet')).toBeInTheDocument();
  });

  it('votes with the toggled choices and waits for the server', async () => {
    let resolve!: (ok: boolean) => void;
    const onVote = vi.fn(() => new Promise<boolean>((r) => (resolve = r)));
    renderBubble(poll(true, { [ME]: [0] }), { value: kinds({ onVote }) });
    await userEvent.click(screen.getByRole('checkbox', { name: /Hills/ }));
    expect(onVote).toHaveBeenCalledWith(expect.objectContaining({ id: 'm1' }), [0, 1]);
    // Pending: nothing applied locally yet, and no second vote while it's in flight.
    const group = screen.getByRole('group', { name: 'Where to?' });
    expect(group).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByRole('checkbox', { name: /Hills/ })).toHaveAttribute(
      'aria-checked',
      'false',
    );
    await userEvent.click(screen.getByRole('checkbox', { name: /Home/ }));
    expect(onVote).toHaveBeenCalledTimes(1);
    await act(async () => resolve(true));
    expect(group).toHaveAttribute('aria-busy', 'false');
  });

  it('switches a single-choice vote and withdraws it on a second tap', async () => {
    const onVote = vi.fn(async () => true);
    renderBubble(poll(false, { [ME]: [1] }), { value: kinds({ onVote }) });
    await userEvent.click(screen.getByRole('radio', { name: /Beach/ }));
    expect(onVote).toHaveBeenLastCalledWith(expect.anything(), [0]);
    await userEvent.click(screen.getByRole('radio', { name: /Hills/ }));
    expect(onVote).toHaveBeenLastCalledWith(expect.anything(), []);
  });

  it('lists who voted for what in groups', async () => {
    renderBubble(poll(false, { [MAYA]: [0], [LEO]: [2] }), {
      value: kinds({ isGroup: true }),
    });
    await userEvent.click(screen.getByRole('button', { name: 'View votes' }));
    const dialog = await screen.findByRole('dialog', { name: 'Where to?' });
    expect(within(dialog).getByText('Maya')).toBeInTheDocument();
    expect(within(dialog).getByText('Leo')).toBeInTheDocument();
  });

  it('has no "View votes" in a direct chat', () => {
    renderBubble(poll(false, { [MAYA]: [0] }));
    expect(screen.queryByRole('button', { name: 'View votes' })).toBeNull();
  });
});

describe('view once', () => {
  const unopened = {
    kind: 'attachment' as const,
    body: undefined,
    viewOnce: { kind: 'image' as const, consumed: false },
  };

  it('offers one tap to view, nothing else', async () => {
    const value = kinds();
    renderBubble(unopened, { value });
    expect(screen.getByText('View once photo')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Tap to view' }));
    expect(value.onOpenViewOnce).toHaveBeenCalledWith(expect.objectContaining({ id: 'm1' }));
    expect(screen.queryByRole('link')).toBeNull();
  });

  it('shows "Opened" once it has been viewed', () => {
    renderBubble({ ...unopened, viewOnce: { kind: 'video', consumed: true } });
    expect(screen.getByText('Opened')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Tap to view' })).toBeNull();
  });

  it('shows my own copy as a view once photo, opened', () => {
    renderBubble(
      { ...unopened, senderId: ME, status: 'sent', viewOnce: { kind: 'image', consumed: true } },
      { mine: true },
    );
    expect(screen.getByText('View once photo')).toBeInTheDocument();
    expect(screen.getByText('Opened')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Tap to view' })).toBeNull();
  });

  it('says honestly what it does and revokes the media when closed', async () => {
    // jsdom has no object URLs.
    const revoke = vi.fn();
    Object.assign(URL, { createObjectURL: vi.fn(() => 'blob:once'), revokeObjectURL: revoke });
    const onClose = vi.fn();
    const { rerender } = render(
      <ViewOnceViewer media={{ kind: 'image', bytes: new Uint8Array([1, 2]) }} onClose={onClose} />,
    );
    const dialog = screen.getByRole('dialog', { name: 'View once photo' });
    expect(
      within(dialog).getByText('Opens once on this device. Screenshots can’t be blocked.'),
    ).toBeInTheDocument();
    expect(within(dialog).queryByRole('link')).toBeNull();
    expect(within(dialog).queryByRole('button', { name: /download|forward|copy/i })).toBeNull();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalled();
    rerender(<ViewOnceViewer media={null} onClose={onClose} />);
    expect(revoke).toHaveBeenCalledWith('blob:once');
  });
});

describe('mentions, edited and forwarded', () => {
  it('names validated mentions in their tone and leaves other tokens literal', () => {
    renderBubble({ body: `Hi @[${LEO}] and @[${STRANGER}]`, mentions: [LEO] });
    const mention = screen.getByText('@Leo');
    expect(mention.style.color).toBe(`var(--vy-tone-${personTone(LEO)}-name)`);
    expect(screen.getByText(new RegExp(`@\\[${STRANGER}\\]`))).toBeInTheDocument();
  });

  it('uses bold text colour for mentions in high contrast', () => {
    renderBubble({ body: `Hi @[${LEO}]`, mentions: [LEO] }, { highContrast: true });
    const mention = screen.getByText('@Leo');
    expect(mention.style.color).toBe('');
    expect(mention).toHaveClass('font-bold');
  });

  it('marks edited messages by the time and forwarded ones above the content', () => {
    renderBubble({ edited: true, forwarded: true });
    const edited = screen.getByText('Edited');
    expect(edited.closest('[data-meta]')).not.toBeNull();
    const fwd = screen.getByText('Forwarded');
    expect(fwd.compareDocumentPosition(screen.getByText('Hello'))).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
  });
});

describe('pending changes', () => {
  it('marks a bubble with a change on its way without dimming it', () => {
    renderBubble({}, { busy: true });
    expect(screen.getByRole('img', { name: 'Updating' })).toBeInTheDocument();
    const bubble = screen.getByText('Hello').closest('[data-bubble]')!;
    expect(bubble).toHaveAttribute('aria-busy', 'true');
    expect(bubble.className).not.toMatch(/opacity/);
  });
});

import type * as Api from '@vybora/api';
import type { SecureConversation } from '@vybora/api';
import { act, fireEvent, render, renderHook, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ChatRowMenu, RowPreviewText } from './ChatRowParts';
import { useInboxTyping } from './hooks';

const listeners = new Map<string, (who: string, typing: boolean) => void>();
vi.mock('@vybora/api', async (orig) => ({
  ...(await orig<typeof Api>()),
  joinTypingChannel: (
    _c: unknown,
    conv: string,
    _u: string,
    cb: (who: string, t: boolean) => void,
  ) => {
    listeners.set(conv, cb);
    return { send: vi.fn(), leave: vi.fn() };
  },
}));
vi.mock('@/features/auth/AuthProvider', () => ({ useMe: () => ({ userId: 'me' }) }));
vi.mock('@/lib/supabase', () => ({ supabase: {} }));
vi.mock('./ConnectProvider', () => ({ useConnect: () => ({ engine: null }) }));

afterEach(() => {
  listeners.clear();
  vi.useRealTimers();
});

describe('chat row preview', () => {
  it('shows You: with ticks for my last message', () => {
    render(
      <RowPreviewText
        unread={false}
        preview={{ prefix: 'You', text: 'See you', receipt: 'read', typing: false }}
      />,
    );
    expect(screen.getByText('You:')).toBeInTheDocument();
    expect(screen.getByLabelText('Read')).toBeInTheDocument();
  });

  it('shows typing in place of the preview', () => {
    render(
      <RowPreviewText
        unread={false}
        preview={{ prefix: null, text: 'typing…', receipt: null, typing: true }}
      />,
    );
    expect(screen.getByText('typing…')).toHaveClass('text-accent');
  });
});

describe('chat row menu', () => {
  const conv = {
    id: 'c1',
    pinned: false,
    archived: false,
    mutedUntil: null,
  } as unknown as SecureConversation;
  it('offers pin, mute and archive', async () => {
    const onPrefs = vi.fn();
    const onArchive = vi.fn();
    render(
      <ChatRowMenu conv={conv} title="Maya" onPrefs={onPrefs} onArchive={onArchive}>
        <a href="/messages/c1">Maya</a>
      </ChatRowMenu>,
    );
    fireEvent.contextMenu(screen.getByText('Maya'));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Pin' }));
    expect(onPrefs).toHaveBeenCalledWith({ pinned: true });
    fireEvent.contextMenu(screen.getByText('Maya'));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Archive' }));
    expect(onArchive).toHaveBeenCalled();
  });
});

describe('typing in the chat list', () => {
  it('clears a typing indicator that never receives a stop after 5 seconds', () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useInboxTyping(['c1', 'c2'], true));
    act(() => listeners.get('c1')!('maya', true));
    expect(result.current.c1).toEqual(['maya']);
    act(() => vi.advanceTimersByTime(5_000));
    expect(result.current.c1).toEqual([]);
  });

  it('joins nothing when disabled', () => {
    renderHook(() => useInboxTyping(['c1'], false));
    expect(listeners.size).toBe(0);
  });
});

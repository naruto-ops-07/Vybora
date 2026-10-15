import type * as Api from '@vybora/api';
import type { SecureConversation } from '@vybora/api';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ChatRowMenu, RowPreviewText } from './ChatRowParts';
import { useInboxTyping, useLastSeen } from './hooks';

const { fetchLastSeen } = vi.hoisted(() => ({ fetchLastSeen: vi.fn() }));
const listeners = new Map<string, (who: string, typing: boolean) => void>();
const joins: string[] = [];
const leaves: string[] = [];
vi.mock('@vybora/api', async (orig) => ({
  ...(await orig<typeof Api>()),
  fetchLastSeen: (...a: unknown[]) => fetchLastSeen(...a),
  joinTypingChannel: (
    _c: unknown,
    conv: string,
    _u: string,
    cb: (who: string, t: boolean) => void,
  ) => {
    listeners.set(conv, cb);
    joins.push(conv);
    return { send: vi.fn(), leave: () => leaves.push(conv) };
  },
}));
vi.mock('@/features/auth/AuthProvider', () => ({ useMe: () => ({ userId: 'me' }) }));
vi.mock('@/lib/supabase', () => ({ supabase: {} }));
vi.mock('./ConnectProvider', () => ({ useConnect: () => ({ engine: null }) }));

beforeEach(() => {
  listeners.clear();
  joins.length = 0;
  leaves.length = 0;
});

afterEach(() => {
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

  it('keeps channels and live indicators when the same chats are reordered', () => {
    const { result, rerender } = renderHook(({ ids }) => useInboxTyping(ids, true), {
      initialProps: { ids: ['c1', 'c2'] },
    });
    act(() => listeners.get('c1')!('maya', true));
    expect(joins).toEqual(['c1', 'c2']);
    rerender({ ids: ['c2', 'c1'] });
    expect(leaves).toEqual([]);
    expect(joins).toEqual(['c1', 'c2']);
    expect(result.current.c1).toEqual(['maya']);
  });

  it('leaves only the removed chat and joins only the new one', () => {
    const { result, rerender } = renderHook(({ ids }) => useInboxTyping(ids, true), {
      initialProps: { ids: ['c1', 'c2'] },
    });
    act(() => listeners.get('c1')!('maya', true));
    act(() => listeners.get('c2')!('sam', true));
    rerender({ ids: ['c2', 'c3'] });
    expect(leaves).toEqual(['c1']);
    expect(joins).toEqual(['c1', 'c2', 'c3']);
    expect(result.current.c1).toBeUndefined();
    expect(result.current.c2).toEqual(['sam']);
  });

  it('clears the entry on a typing stop', () => {
    const { result } = renderHook(() => useInboxTyping(['c1'], true));
    act(() => listeners.get('c1')!('maya', true));
    expect(result.current.c1).toEqual(['maya']);
    act(() => listeners.get('c1')!('maya', false));
    expect(result.current.c1).toEqual([]);
  });

  it('leaves every channel on unmount', () => {
    const { unmount } = renderHook(() => useInboxTyping(['c1', 'c2'], true));
    unmount();
    expect(leaves.sort()).toEqual(['c1', 'c2']);
  });

  it('joins nothing when disabled', () => {
    renderHook(() => useInboxTyping(['c1'], false));
    expect(listeners.size).toBe(0);
  });
});

const makeWrapper = (client: QueryClient) =>
  function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
const wrapper = () =>
  makeWrapper(new QueryClient({ defaultOptions: { queries: { retry: false } } }));

describe('last seen in the header', () => {
  it('returns the allowed time for a peer', async () => {
    fetchLastSeen.mockResolvedValue({ maya: '2026-10-15T09:12:00Z' });
    const { result } = renderHook(() => useLastSeen('maya', true), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.data).toBe('2026-10-15T09:12:00Z'));
  });

  it('falls back quietly when the request fails (offline)', async () => {
    fetchLastSeen.mockRejectedValue(new TypeError('Failed to fetch'));
    const { result } = renderHook(() => useLastSeen('maya', true), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.data).toBeUndefined();
  });

  it('does not ask when my own online status is off', () => {
    fetchLastSeen.mockClear();
    renderHook(() => useLastSeen('maya', false), { wrapper: wrapper() });
    expect(fetchLastSeen).not.toHaveBeenCalled();
  });

  it('hides cached last seen once my own online status is turned off', async () => {
    fetchLastSeen.mockResolvedValue({ maya: '2026-10-15T09:12:00Z' });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { result, rerender } = renderHook(({ on }) => useLastSeen('maya', on), {
      wrapper: makeWrapper(client),
      initialProps: { on: true },
    });
    await waitFor(() => expect(result.current.data).toBe('2026-10-15T09:12:00Z'));
    rerender({ on: false });
    expect(result.current.data).toBeUndefined();
  });
});

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, renderHook, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { setAppLocked } from './lockState';

const ack = vi.fn(async () => undefined);
vi.mock('@vybora/api', () => ({
  acknowledgeConversation: (...a: unknown[]) => ack(...(a as [])),
  subscribeToSecureConversation: () => () => undefined,
  qk: {
    connect: { messages: (id: string) => ['connect', 'messages', id], inbox: ['inbox'] },
    unread: ['unread'],
  },
}));
vi.mock('@/lib/supabase', () => ({ supabase: {} }));
vi.mock('@/features/auth/AuthProvider', () => ({ useMe: () => ({ userId: 'me' }) }));
const engine = {
  listMessages: async () => [{ id: 'm1', seq: 3 }],
  sync: async () => ({ status: 'ready' }),
};
vi.mock('@/features/connect/ConnectProvider', () => ({
  useConnect: () => ({ engine, setActiveConversation: () => undefined }),
}));

const { useSecureMessages } = await import('@/features/connect/hooks');
const { playTone } = await import('@/lib/connect/tones');
const { AppLockProvider } = await import('./AppLockProvider');
const { AppLockCover } = await import('./AppLockGate');
const { createRecord, saveLock } = await import('./store');

afterEach(() => {
  act(() => setAppLocked(false));
  ack.mockClear();
});

describe('while locked', () => {
  it('sends no read receipt, then one after unlock', async () => {
    act(() => setAppLocked(true));
    const qc = new QueryClient();
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={qc}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(() => useSecureMessages('c1'), { wrapper });
    await waitFor(() => expect(result.current.messages.data).toHaveLength(1));
    await new Promise((r) => setTimeout(r, 20));
    expect(ack).not.toHaveBeenCalled();
    act(() => setAppLocked(false));
    await waitFor(() => expect(ack).toHaveBeenCalledTimes(1));
  });

  it('plays no message tone', () => {
    const play = vi.fn(async () => undefined);
    vi.stubGlobal(
      'Audio',
      class {
        volume = 1;
        currentTime = 0;
        play = play;
      },
    );
    act(() => setAppLocked(true));
    playTone('chime' as never);
    expect(play).not.toHaveBeenCalled();
    act(() => setAppLocked(false));
    playTone('chime' as never);
    expect(play).toHaveBeenCalledTimes(1);
    vi.unstubAllGlobals();
  });
});

describe('portaled layers', () => {
  it('are inert and hidden while the lock screen is up', async () => {
    saveLock('me', await createRecord('135790'));
    const toast = document.createElement('div');
    toast.setAttribute('aria-live', 'polite');
    toast.textContent = 'New message from Sam';
    document.body.appendChild(toast);
    const { unmount } = render(
      <QueryClientProvider client={new QueryClient()}>
        <AppLockProvider userId="me" userName="me" signOut={async () => undefined}>
          <AppLockCover>
            <p>chats</p>
          </AppLockCover>
        </AppLockProvider>
      </QueryClientProvider>,
    );
    expect(screen.getByRole('dialog', { name: 'VYBORA is locked' })).toBeInTheDocument();
    expect(toast).toHaveAttribute('inert');
    expect(toast).toHaveAttribute('aria-hidden', 'true');
    const late = document.createElement('div');
    document.body.appendChild(late);
    await waitFor(() => expect(late).toHaveAttribute('inert'));
    unmount();
    expect(toast).not.toHaveAttribute('inert');
    expect(toast).not.toHaveAttribute('aria-hidden');
    toast.remove();
    late.remove();
    localStorage.clear();
  }, 60_000);
});

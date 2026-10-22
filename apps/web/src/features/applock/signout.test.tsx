import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render } from '@testing-library/react';
import { appLockKey } from '@vybora/core';
import { describe, expect, it, vi } from 'vitest';

type Listener = (event: string, session: unknown) => void;
const listeners: Listener[] = [];

vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: async () => ({ data: { session: { user: { id: 'u-9' } } } }),
      onAuthStateChange: (cb: Listener) => {
        listeners.push(cb);
        return { data: { subscription: { unsubscribe: () => undefined } } };
      },
    },
  },
}));
vi.mock('@vybora/api', () => ({
  clearSignedUrlCache: () => undefined,
  fetchMyProfile: async () => null,
  getMyRoles: async () => [],
  qk: { me: (id: string) => ['me', id], roles: (id: string) => ['roles', id] },
}));

const { AuthProvider } = await import('@/features/auth/AuthProvider');

describe('signing out clears the app lock', () => {
  it('removes this user’s lock on SIGNED_OUT', async () => {
    localStorage.setItem(appLockKey('u-9'), '{"v":1}');
    localStorage.setItem(appLockKey('someone-else'), '{"v":1}');
    render(
      <QueryClientProvider client={new QueryClient()}>
        <AuthProvider>
          <p>app</p>
        </AuthProvider>
      </QueryClientProvider>,
    );
    await act(async () => undefined);
    act(() => listeners.forEach((l) => l('SIGNED_OUT', null)));
    expect(localStorage.getItem(appLockKey('u-9'))).toBeNull();
    expect(localStorage.getItem(appLockKey('someone-else'))).not.toBeNull();
  });
});

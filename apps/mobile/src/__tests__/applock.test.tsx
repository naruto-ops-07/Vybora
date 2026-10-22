import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { A11Y_STORAGE_KEY, type AppLockAway } from '@vybora/core';
import { AppState, Text } from 'react-native';

const mockStore = new Map<string, string>();
jest.mock('expo-secure-store', () => ({
  getItemAsync: (k: string) => Promise.resolve(mockStore.get(k) ?? null),
  setItemAsync: (k: string, v: string) => Promise.resolve(void mockStore.set(k, v)),
  deleteItemAsync: (k: string) => Promise.resolve(void mockStore.delete(k)),
}));
const mockAuth = jest.fn();
jest.mock('expo-local-authentication', () => ({
  hasHardwareAsync: () => Promise.resolve(true),
  isEnrolledAsync: () => Promise.resolve(true),
  authenticateAsync: (...a: unknown[]) => mockAuth(...a),
}));
type AuthCb = (event: string, session: unknown) => void;
const mockAuthCb: { fn: AuthCb | null } = { fn: null };
jest.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: () => Promise.resolve({ data: { session: { user: { id: 'u1' } } } }),
      onAuthStateChange: (cb: AuthCb) => {
        mockAuthCb.fn = cb;
        return { data: { subscription: { unsubscribe: () => undefined } } };
      },
    },
  },
  supabaseConfig: { url: 'http://x', anonKey: 'k' },
}));
const mockSegments = { value: ['messages'] as string[] };
jest.mock('expo-router', () => ({ useSegments: () => mockSegments.value }));
const mockUser = { id: 'u1' as string | null };
jest.mock('@/features/auth/AuthProvider', () => ({
  ...jest.requireActual('@/features/auth/AuthProvider'),
  useAuth: () => ({ userId: mockUser.id }),
}));

import { A11yProvider } from '@/lib/a11y';
import * as lock from '@/lib/connect/appLock';
import { AppLockShell } from '@/features/applock/AppLockCover';
import { LockScreen } from '@/features/applock/LockScreen';
import { AuthProvider } from '@/features/auth/AuthProvider';

const ON = 'vybora.connect.applock.u1';
type Handler = (s: string) => void;
let handlers: Handler[] = [];
const fire = (s: string) => act(() => handlers.slice().forEach((h) => h(s)));

beforeEach(() => {
  mockStore.clear();
  lock.resetAppLockForTests();
  mockAuth.mockResolvedValue({ success: true });
  mockSegments.value = ['messages'];
  mockUser.id = 'u1';
  handlers = [];
  jest.spyOn(AppState, 'addEventListener').mockImplementation(((_: string, h: Handler) => {
    handlers.push(h);
    return { remove: () => (handlers = handlers.filter((x) => x !== h)) };
  }) as never);
});
afterEach(() => jest.restoreAllMocks());

async function enableAndUnlock(away: AppLockAway) {
  mockStore.set(ON, '1');
  await lock.setAppLockUser('u1');
  await lock.setAppLockAway(away);
  expect(lock.isUnlockedNow()).toBe(false); // locked when the app opens
  expect(await lock.authenticate()).toBe(true);
}

const shell = () =>
  render(
    <A11yProvider>
      <AppLockShell>
        <Text>chat list</Text>
      </AppLockShell>
    </A11yProvider>,
  );

describe('app lock timing', () => {
  it.each<[AppLockAway, number, boolean]>([
    ['immediately', 1, false],
    ['1m', 59_000, true],
    ['1m', 60_000, false],
    ['5m', 299_000, true],
    ['5m', 300_000, false],
    ['1h', 3_599_000, true],
    ['1h', 3_600_000, false],
  ])('%s: away %d ms → unlocked %s', async (away, ms, stays) => {
    await enableAndUnlock(away);
    const t0 = Date.now();
    lock.noteBackground(t0);
    lock.noteActive(t0 + ms);
    expect(lock.isUnlockedNow()).toBe(stays);
  });

  it('background → active locks with no frame of chat content, unlock shows it', async () => {
    await enableAndUnlock('immediately');
    await shell();
    expect(screen.getByText('chat list')).toBeTruthy();
    const now = Date.now();
    jest.spyOn(Date, 'now').mockReturnValue(now);
    await fire('background');
    expect(screen.queryByText('chat list')).toBeNull();
    jest.spyOn(Date, 'now').mockReturnValue(now + 1000);
    // Synchronously, inside the same act as the `active` event: never visible.
    await fire('active');
    expect(screen.queryByText('chat list')).toBeNull();
    expect(screen.getByRole('button', { name: 'Unlock Messages' })).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Unlock Messages' }));
    expect(await screen.findByText('chat list')).toBeTruthy();
  });

  it('covers every messages route; other routes stay open', async () => {
    mockStore.set(ON, '1');
    mockSegments.value = ['messages', 'legacy', '[id]'];
    await shell();
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Unlock Messages' })).toBeTruthy(),
    );
    expect(screen.queryByText('chat list')).toBeNull();
    mockSegments.value = ['settings'];
    await shell();
    expect(screen.getByText('chat list')).toBeTruthy();
  });

  it('settings persist per user and bad values fall back to 1 minute', async () => {
    await lock.setAppLockUser('u1');
    await lock.setAppLockAway('5m');
    expect(mockStore.get('vybora.connect.applock.away.u1')).toBe('5m');
    await lock.setAppLockUser('u2');
    expect(await lock.getAppLockAway()).toBe('1m');
    await lock.setAppLockUser('u1');
    expect(await lock.getAppLockAway()).toBe('5m');
    mockStore.set('vybora.connect.applock.away.u1', 'forever');
    expect(await lock.getAppLockAway()).toBe('1m');
  });

  it('a user switch forgets the unlock', async () => {
    await enableAndUnlock('1h');
    mockStore.set('vybora.connect.applock.u2', '1');
    await lock.setAppLockUser('u2');
    expect(lock.isUnlockedNow()).toBe(false);
  });

  it('sign out clears the lock and the unlock', async () => {
    await enableAndUnlock('1h');
    const qc = new QueryClient();
    await render(
      <QueryClientProvider client={qc}>
        <AuthProvider>
          <Text>app</Text>
        </AuthProvider>
      </QueryClientProvider>,
    );
    await act(() => mockAuthCb.fn!('SIGNED_IN', { user: { id: 'u1' } }));
    await act(async () => mockAuthCb.fn!('SIGNED_OUT', null));
    await waitFor(() => expect(mockStore.has(ON)).toBe(false));
    expect(mockStore.has('vybora.connect.applock.away.u1')).toBe(false);
    qc.clear();
  });

  it('adopts the old device-wide flag for the signed-in user', async () => {
    mockStore.set('vybora.connect.applock', '1');
    await lock.setAppLockUser('u1');
    expect(lock.isUnlockedNow()).toBe(false);
    expect(mockStore.get(ON)).toBe('1');
    expect(mockStore.has('vybora.connect.applock')).toBe(false);
  });
});

describe('app-switcher cover', () => {
  it.each(['background', 'inactive'])('covers on %s and drops once active', async (state) => {
    mockStore.set(ON, '1');
    mockSegments.value = ['settings'];
    await shell();
    await waitFor(() => expect(lock.appLockEnabledNow()).toBe(true));
    await fire(state);
    expect(screen.getByTestId('app-lock-cover')).toBeTruthy();
    expect(screen.queryByRole('button')).toBeNull();
    // Content under the cover is hidden from screen readers.
    expect(screen.queryByText('chat list')).toBeNull();
    await fire('active');
    expect(screen.queryByTestId('app-lock-cover')).toBeNull();
    expect(screen.getByText('chat list')).toBeTruthy();
  });

  it('no cover when app lock is off', async () => {
    await shell();
    await waitFor(() => expect(lock.appLockEnabledNow()).toBe(false));
    await fire('background');
    expect(screen.queryByTestId('app-lock-cover')).toBeNull();
    expect(screen.getByText('chat list')).toBeTruthy();
  });
});

describe('lock screen look', () => {
  it('draws the glow and gradient in the look', async () => {
    await render(
      <A11yProvider>
        <LockScreen onUnlock={() => undefined} />
      </A11yProvider>,
    );
    expect(screen.getByTestId('lock-glow', { includeHiddenElements: true })).toBeTruthy();
    expect(
      screen.getAllByTestId('gradient-fill', { includeHiddenElements: true }).length,
    ).toBeGreaterThan(0);
  });

  it('is flat under high contrast', async () => {
    mockStore.set(A11Y_STORAGE_KEY, JSON.stringify({ highContrast: true }));
    await render(
      <A11yProvider>
        <LockScreen onUnlock={() => undefined} />
      </A11yProvider>,
    );
    await waitFor(() =>
      expect(screen.queryByTestId('lock-glow', { includeHiddenElements: true })).toBeNull(),
    );
    expect(screen.queryByTestId('gradient-fill', { includeHiddenElements: true })).toBeNull();
    expect(screen.getByRole('button', { name: 'Unlock Messages' })).toBeTruthy();
  });
});

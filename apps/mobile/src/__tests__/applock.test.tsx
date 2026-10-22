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
jest.mock('@/lib/supabase', () => ({
  supabase: {},
  supabaseConfig: { url: 'http://x', anonKey: 'k' },
}));
jest.mock('@/features/connect/ConnectProvider', () => ({
  useConnect: () => ({ status: 'ready', error: null, retry: jest.fn() }),
}));

import { A11yProvider } from '@/lib/a11y';
import * as lock from '@/lib/connect/appLock';
import { AppLockCover } from '@/features/applock/AppLockCover';
import { LockScreen } from '@/features/applock/LockScreen';
import { ConnectGate } from '@/features/connect/ConnectGate';

type Handler = (s: string) => void;
let handlers: Handler[] = [];
const fire = (s: string) => act(() => handlers.slice().forEach((h) => h(s)));

beforeEach(() => {
  mockStore.clear();
  lock.resetAppLockForTests();
  mockAuth.mockResolvedValue({ success: true });
  handlers = [];
  jest.spyOn(AppState, 'addEventListener').mockImplementation(((_: string, h: Handler) => {
    handlers.push(h);
    return { remove: () => (handlers = handlers.filter((x) => x !== h)) };
  }) as never);
});
afterEach(() => jest.restoreAllMocks());

async function enableAndUnlock(away: AppLockAway) {
  mockStore.set('vybora.connect.applock', '1');
  await lock.setAppLockAway(away);
  expect(await lock.isUnlocked()).toBe(false); // locked when the app opens
  expect(await lock.authenticate()).toBe(true);
}

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
    expect(await lock.isUnlocked(t0 + ms)).toBe(stays);
  });

  it('locks through AppState background → active (gate shows the lock screen)', async () => {
    await enableAndUnlock('immediately');
    await render(
      <A11yProvider>
        <ConnectGate>
          <Text>chat list</Text>
        </ConnectGate>
        <AppLockCover />
      </A11yProvider>,
    );
    expect(await screen.findByText('chat list')).toBeTruthy();
    const now = Date.now();
    jest.spyOn(Date, 'now').mockReturnValue(now);
    await fire('background');
    jest.spyOn(Date, 'now').mockReturnValue(now + 1000);
    await fire('active');
    await waitFor(() => expect(screen.queryByText('chat list')).toBeNull());
    expect(screen.getByRole('button', { name: 'Unlock Messages' })).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Unlock Messages' }));
    expect(await screen.findByText('chat list')).toBeTruthy();
  });

  it('settings persist and bad stored values fall back to 1 minute', async () => {
    await lock.setAppLockAway('5m');
    lock.resetAppLockForTests();
    expect(await lock.getAppLockAway()).toBe('5m');
    mockStore.set('vybora.connect.applock.away', 'forever');
    expect(await lock.getAppLockAway()).toBe('1m');
  });
});

describe('app-switcher cover', () => {
  it.each(['background', 'inactive'])('covers on %s and drops once active', async (state) => {
    mockStore.set('vybora.connect.applock', '1');
    await render(
      <A11yProvider>
        <AppLockCover />
      </A11yProvider>,
    );
    await waitFor(() => expect(lock.appLockEnabledNow()).toBe(true));
    await fire(state);
    expect(screen.getByTestId('app-lock-cover')).toBeTruthy();
    expect(screen.queryByRole('button')).toBeNull();
    await fire('active');
    expect(screen.queryByTestId('app-lock-cover')).toBeNull();
  });

  it('no cover when app lock is off', async () => {
    await render(<AppLockCover />);
    await act(() => Promise.resolve());
    await fire('background');
    expect(screen.queryByTestId('app-lock-cover')).toBeNull();
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
    const btn = screen.getByRole('button', { name: 'Unlock Messages' });
    expect(btn).toBeTruthy();
  });
});

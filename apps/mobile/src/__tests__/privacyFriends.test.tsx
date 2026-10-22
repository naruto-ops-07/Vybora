import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { qk, type ConnectPrivacy } from '@vybora/api';
import { Alert } from 'react-native';
import PrivacyScreen from '@/app/messages/privacy';

const mockPrivacy = jest.fn();
const mockUpdate = jest.fn();

jest.mock('@vybora/api', () => ({
  ...jest.requireActual('@vybora/api'),
  fetchConnectPrivacy: (...a: unknown[]) => mockPrivacy(...a),
  updateConnectPrivacy: (...a: unknown[]) => mockUpdate(...a),
  fetchBlocked: () => Promise.resolve([]),
  fetchMyContactMethod: () => Promise.resolve(null),
}));
jest.mock('@/lib/supabase', () => ({
  supabase: {},
  supabaseConfig: { url: 'http://x', anonKey: 'k' },
}));
jest.mock('@/features/auth/AuthProvider', () => ({ useMe: () => ({ userId: 'me' }) }));
jest.mock('@/features/connect/ConnectProvider', () => ({
  useConnect: () => ({
    status: 'ready',
    error: null,
    retry: jest.fn(),
    engine: null,
    backend: 'js',
    signOutAndWipe: jest.fn(),
  }),
}));
jest.mock('@/lib/connect/appLock', () => ({
  isUnlocked: () => Promise.resolve(true),
  authenticate: () => Promise.resolve(true),
  isAppLockEnabled: () => Promise.resolve(false),
  appLockSupport: () => Promise.resolve({ available: false, reason: '' }),
  setAppLock: () => Promise.resolve(false),
  getAppLockAway: () => Promise.resolve('1m'),
  setAppLockAway: () => Promise.resolve(),
  subscribeAppLock: () => () => undefined,
}));
jest.mock('expo-router', () => {
  const Stack = () => null;
  Stack.Screen = () => null;
  return { router: { replace: jest.fn() }, Stack };
});

const base: ConnectPrivacy = {
  read_receipts: true,
  typing_indicators: true,
  show_online: true,
  notifications_enabled: true,
  message_previews: true,
  message_privacy: 'everyone',
} as ConnectPrivacy;

const clients: QueryClient[] = [];
async function renderScreen(privacy: Partial<ConnectPrivacy>) {
  mockPrivacy.mockResolvedValue({ ...base, ...privacy });
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { gcTime: Infinity } },
  });
  clients.push(qc);
  await render(
    <QueryClientProvider client={qc}>
      <PrivacyScreen />
    </QueryClientProvider>,
  );
  return qc;
}
const radio = (name: string) => screen.getByRole('radio', { name });

let alert: jest.SpyInstance;
beforeEach(() => {
  jest.clearAllMocks();
  alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
});
afterEach(async () => {
  await cleanup();
  clients.splice(0).forEach((c) => c.clear());
  alert.mockRestore();
});

describe('Who can start chats with me', () => {
  it('shows Everyone selected by default', async () => {
    await renderScreen({});
    await waitFor(() => expect(radio('Everyone')).toBeChecked());
    expect(radio('Friends only')).not.toBeChecked();
  });

  it('switches to Friends only at once and keeps it once saved', async () => {
    let release!: () => void;
    mockUpdate.mockReturnValue(new Promise<void>((r) => (release = r)));
    await renderScreen({});
    await waitFor(() => expect(radio('Everyone')).toBeChecked());
    await fireEvent.press(radio('Friends only'));
    // Before the server has answered.
    await waitFor(() => expect(radio('Friends only')).toBeChecked());
    expect(mockUpdate).toHaveBeenCalledWith({}, 'me', { message_privacy: 'friends' });
    mockPrivacy.mockResolvedValue({ ...base, message_privacy: 'friends' });
    release();
    await waitFor(() => expect(mockPrivacy.mock.calls.length).toBeGreaterThan(1));
    await waitFor(() => expect(radio('Friends only')).toBeChecked());
    expect(alert).not.toHaveBeenCalled();
  });

  it('goes back to Everyone and says so when saving fails', async () => {
    mockUpdate.mockRejectedValue(new TypeError('Failed to fetch'));
    await renderScreen({});
    await waitFor(() => expect(radio('Everyone')).toBeChecked());
    await fireEvent.press(radio('Friends only'));
    await waitFor(() => expect(alert).toHaveBeenCalled());
    expect(alert.mock.calls[0]![0]).toBe('Not saved');
    await waitFor(() => expect(radio('Everyone')).toBeChecked());
  });

  it('keeps the legacy following value explained, with a way back', async () => {
    mockUpdate.mockResolvedValue(undefined);
    await renderScreen({ message_privacy: 'following' });
    await waitFor(() =>
      expect(screen.getByText(/Currently limited to people you followed/)).toBeTruthy(),
    );
    expect(radio('Everyone')).not.toBeChecked();
    expect(radio('Friends only')).not.toBeChecked();
    await fireEvent.press(screen.getByRole('button', { name: 'Allow everyone' }));
    expect(mockUpdate).toHaveBeenCalledWith({}, 'me', { message_privacy: 'everyone' });
  });

  it('a refetch already in flight cannot undo a switch you just made', async () => {
    const qc = await renderScreen({});
    await waitFor(() => expect(radio('Everyone')).toBeChecked());
    let stale!: (v: ConnectPrivacy) => void;
    mockPrivacy.mockReturnValue(new Promise<ConnectPrivacy>((r) => (stale = r)));
    void qc.invalidateQueries({ queryKey: qk.connect.privacy });
    await waitFor(() => expect(mockPrivacy).toHaveBeenCalledTimes(2));
    mockUpdate.mockReturnValue(new Promise(() => undefined));
    await fireEvent.press(radio('Friends only'));
    await waitFor(() => expect(radio('Friends only')).toBeChecked());
    await act(async () => stale(base));
    await waitFor(() => expect(qc.getQueryState(qk.connect.privacy)?.fetchStatus).toBe('idle'));
    expect(radio('Friends only')).toBeChecked();
  });
});

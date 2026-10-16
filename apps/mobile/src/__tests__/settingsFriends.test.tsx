import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor } from '@testing-library/react-native';
import { qk } from '@vybora/api';
import Settings from '@/app/settings';

const mockFetchRequests = jest.fn();
let mockFocused = true;

jest.mock('@vybora/api', () => ({
  ...jest.requireActual('@vybora/api'),
  fetchSettings: () => Promise.resolve({ theme: 'system', email_notifications: true }),
  fetchFriendRequests: (...a: unknown[]) => mockFetchRequests(...a),
}));
jest.mock('@/lib/supabase', () => ({
  supabase: {},
  supabaseConfig: { url: 'http://x', anonKey: 'k' },
}));
jest.mock('@/lib/media', () => ({ pickMedia: jest.fn() }));
// Stable identity: Settings copies the profile into its form on change.
const mockMe = {
  userId: 'me',
  profile: { username: 'me', display_name: 'Me', bio: '', website: null, avatar_path: null },
};
jest.mock('@/features/auth/AuthProvider', () => ({ useMe: () => mockMe }));
jest.mock('expo-router', () => ({
  router: { push: jest.fn(), replace: jest.fn() },
  useIsFocused: () => mockFocused,
}));

const clients: QueryClient[] = [];
async function renderSettings() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { gcTime: Infinity } },
  });
  clients.push(qc);
  await render(
    <QueryClientProvider client={qc}>
      <Settings />
    </QueryClientProvider>,
  );
  return qc;
}
const interval = (qc: QueryClient) =>
  qc.getQueryCache().find({ queryKey: qk.connect.friendRequests })!.observers[0]!.options
    .refetchInterval;

beforeEach(() => {
  mockFocused = true;
  mockFetchRequests.mockResolvedValue({
    incoming: [{ userId: 'u', username: 'maya', displayName: null, avatarPath: null }],
    outgoing: [],
  });
});
afterEach(async () => {
  await cleanup();
  clients.splice(0).forEach((c) => c.clear());
});

describe('Settings friend requests', () => {
  it('shows the incoming request count and polls while Settings is on screen', async () => {
    const qc = await renderSettings();
    await waitFor(() => expect(screen.getByText('1 friend request')).toBeTruthy());
    expect(interval(qc)).toBe(30_000);
  });

  it('stops polling while another screen is on top', async () => {
    mockFocused = false;
    const qc = await renderSettings();
    await waitFor(() => expect(screen.getByText('1 friend request')).toBeTruthy());
    expect(interval(qc)).toBe(false);
  });
});

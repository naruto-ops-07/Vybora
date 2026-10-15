import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, renderHook, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { useLastSeen } from '@/features/connect/hooks';

const mockFetchLastSeen = jest.fn();

jest.mock('@vybora/api', () => ({
  ...jest.requireActual('@vybora/api'),
  fetchLastSeen: (...a: unknown[]) => mockFetchLastSeen(...a),
}));
jest.mock('@/lib/supabase', () => ({
  supabase: {},
  supabaseConfig: { url: 'http://x', anonKey: 'k' },
}));
jest.mock('@/features/auth/AuthProvider', () => ({ useMe: () => ({ userId: 'me' }) }));
jest.mock('@/features/connect/ConnectProvider', () => ({ useConnect: () => ({ engine: null }) }));

const makeWrapper = (client: QueryClient) =>
  function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
const clients: QueryClient[] = [];
const newClient = () => {
  const c = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  clients.push(c);
  return c;
};

describe('last seen in the header', () => {
  beforeEach(() => mockFetchLastSeen.mockReset());
  // Unmount and clear caches so refetch/gc timers don't keep the worker alive.
  afterEach(async () => {
    await cleanup();
    clients.splice(0).forEach((c) => c.clear());
  });

  it('returns the allowed time for a peer', async () => {
    mockFetchLastSeen.mockResolvedValue({ maya: '2026-10-15T09:12:00Z' });
    const { result } = await renderHook(() => useLastSeen('maya', true), {
      wrapper: makeWrapper(newClient()),
    });
    await waitFor(() => expect(result.current.data).toBe('2026-10-15T09:12:00Z'));
  });

  it('falls back quietly when the request fails (offline)', async () => {
    mockFetchLastSeen.mockRejectedValue(new TypeError('Failed to fetch'));
    const { result } = await renderHook(() => useLastSeen('maya', true), {
      wrapper: makeWrapper(newClient()),
    });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.data).toBeUndefined();
  });

  it('does not ask when my own online status is off', async () => {
    await renderHook(() => useLastSeen('maya', false), { wrapper: makeWrapper(newClient()) });
    expect(mockFetchLastSeen).not.toHaveBeenCalled();
  });

  it('hides cached last seen once my own online status is turned off', async () => {
    mockFetchLastSeen.mockResolvedValue({ maya: '2026-10-15T09:12:00Z' });
    const { result, rerender } = await renderHook(
      ({ on }: { on: boolean }) => useLastSeen('maya', on),
      { wrapper: makeWrapper(newClient()), initialProps: { on: true } },
    );
    await waitFor(() => expect(result.current.data).toBe('2026-10-15T09:12:00Z'));
    await rerender({ on: false });
    expect(result.current.data).toBeUndefined();
  });
});

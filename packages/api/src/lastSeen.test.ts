import { describe, expect, it, vi } from 'vitest';
import { fetchLastSeen, touchActivity } from './connect';
import type { VyboraClient } from './client';

const clientWith = (rpc: ReturnType<typeof vi.fn>) => ({ rpc }) as unknown as VyboraClient;

describe('last seen API', () => {
  it('maps rows by user and caps the request at 100 ids', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: [{ user_id: 'u1', last_active_at: '2026-10-15T10:05:00+00:00' }],
      error: null,
    });
    const ids = Array.from({ length: 150 }, (_, i) => `u${i}`);
    expect(await fetchLastSeen(clientWith(rpc), ids)).toEqual({ u1: '2026-10-15T10:05:00+00:00' });
    expect(rpc).toHaveBeenCalledWith('last_seen', { p_user_ids: ids.slice(0, 100) });
  });

  it('skips the request for an empty list', async () => {
    const rpc = vi.fn();
    expect(await fetchLastSeen(clientWith(rpc), [])).toEqual({});
    expect(rpc).not.toHaveBeenCalled();
  });

  it('throws RPC errors from touchActivity', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: { message: 'offline' } });
    await expect(touchActivity(clientWith(rpc))).rejects.toMatchObject({ message: 'offline' });
  });
});

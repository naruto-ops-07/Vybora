import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@vybora/types';

export type VyboraClient = SupabaseClient<Database>;

/**
 * Throw PostgREST errors so TanStack Query can handle them uniformly. On
 * success PostgREST always returns data for list/single/rpc calls.
 */
export function unwrap<R extends { data: unknown; error: unknown }>(
  result: R,
): NonNullable<R['data']> {
  if (result.error) throw result.error;
  return result.data as NonNullable<R['data']>;
}

/** For `.maybeSingle()` where a missing row is a valid outcome. */
export function unwrapMaybe<R extends { data: unknown; error: unknown }>(
  result: R,
): NonNullable<R['data']> | null {
  if (result.error) throw result.error;
  return (result.data ?? null) as NonNullable<R['data']> | null;
}

export async function requireUserId(client: VyboraClient): Promise<string> {
  const { data } = await client.auth.getSession();
  const id = data.session?.user.id;
  if (!id) throw new Error('not_authenticated');
  return id;
}

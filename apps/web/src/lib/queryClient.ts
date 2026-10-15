import { isRetryable } from '@vybora/core';
import { QueryClient } from '@tanstack/react-query';

export function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        gcTime: 10 * 60_000,
        refetchOnWindowFocus: true,
        retry: (count, error) => count < 2 && isRetryable(error),
      },
      mutations: { retry: false },
    },
  });
}

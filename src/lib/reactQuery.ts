import { QueryClient } from '@tanstack/react-query';

export const CACHE_QUERY_PATTERNS = [
  'attestation',
  'staking',
  'rewards',
  'reputation',
] as const;

export function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 5 * 60 * 1000,
        gcTime: 10 * 60 * 1000,
        retry: 2,
        refetchOnWindowFocus: false,
      },
    },
  });
}

let queryClientInstance: QueryClient | null = null;

export function getQueryClient(): QueryClient {
  if (!queryClientInstance) {
    queryClientInstance = createQueryClient();
  }
  return queryClientInstance;
}

export function clearAllCaches(queryClient: QueryClient): { invalidated: number } {
  let invalidated = 0;
  for (const pattern of CACHE_QUERY_PATTERNS) {
    queryClient.invalidateQueries({
      queryKey: [pattern],
      refetchType: 'none',
    });
    invalidated++;
    queryClient.resetQueries({
      queryKey: [pattern],
      exact: false,
    });
    invalidated++;
  }
  return { invalidated };
}

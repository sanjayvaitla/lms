import { QueryClient, MutationCache, QueryCache } from '@tanstack/react-query';
import { refreshLmsAfterMutation } from './lmsCache';

/**
 * Performance-tuned defaults for LMS:
 * - Longer staleTime → fewer background refetches (login/dashboard feel snappier)
 * - No refetch-on-focus globally → content-master queries override this locally
 * - Mutations with meta.refreshLms auto-refresh related views
 */
export const queryClient = new QueryClient({
  queryCache: new QueryCache({
    onError: (error, query) => {
      if (import.meta.env.DEV) {
        console.error(`[QueryError] key=${JSON.stringify(query.queryKey)}`, error);
      }
    },
  }),
  mutationCache: new MutationCache({
    onError: (error, _variables, _context, mutation) => {
      if (import.meta.env.DEV) {
        console.error(`[MutationError] key=${JSON.stringify(mutation.options.mutationKey ?? 'anonymous')}`, error);
      }
    },
    onSuccess: async (_data, _variables, _context, mutation) => {
      const meta = mutation.meta as
        | { refreshLms?: { courseId?: string; batchId?: string } }
        | undefined;
      if (meta?.refreshLms) {
        await refreshLmsAfterMutation(queryClient, meta.refreshLms);
      }
    },
  }),
  defaultOptions: {
    queries: {
      // Keep data warm for 60s, but refetch when stale on remount so
      // submit → navigate-back always shows fresh status (no hard refresh).
      staleTime: 60_000,
      gcTime: 1000 * 60 * 15,
      retry: 1,
      refetchOnWindowFocus: false,
      refetchOnReconnect: true,
      refetchOnMount: true,
    },
    mutations: {
      retry: 0,
    },
  },
});

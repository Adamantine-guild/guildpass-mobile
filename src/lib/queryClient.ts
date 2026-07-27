import { QueryClient, MutationCache } from "@tanstack/react-query";
import { QUERY_GC_TIME_MS, QUERY_STALE_TIME_MS } from "./offlineCache";
import { QueueableMutationMeta } from "../features/offline/mutationQueue";

export const queryClient = new QueryClient({
  mutationCache: new MutationCache({
    onError: (error, variables, context, mutation) => {
      // Check for conflict (e.g. 409 status or message containing 'conflict')
      const isConflict = error instanceof Error && 
        (error.message.includes("409") || error.message.toLowerCase().includes("conflict"));
      
      if (isConflict && mutation.meta?.isQueueable) {
        (mutation.meta as any).isConflict = true;
      }
    },
  }),
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: QUERY_STALE_TIME_MS,
      gcTime: QUERY_GC_TIME_MS,
      networkMode: "offlineFirst",
    },
    mutations: {
      retry: false,
    },
  },
});

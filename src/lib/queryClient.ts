import { QueryClient } from "@tanstack/react-query";
import { QUERY_GC_TIME_MS, QUERY_STALE_TIME_MS } from "./offlineCache";

export const queryClient = new QueryClient({
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

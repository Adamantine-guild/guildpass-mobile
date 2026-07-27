import { useMutation, UseMutationOptions, UseMutationResult } from "@tanstack/react-query";
import { MutationType, QueueableMutationMeta } from "./mutationQueue";

export interface OfflineMutationOptions<TData = unknown, TError = Error, TVariables = void, TContext = unknown> 
  extends UseMutationOptions<TData, TError, TVariables, TContext> {
  mutationType: MutationType;
}

/**
 * A specialized wrapper over TanStack Query's useMutation.
 * Enforces the offline-first queueable mutation pattern.
 */
export function useOfflineMutation<TData = unknown, TError = Error, TVariables = void, TContext = unknown>(
  options: OfflineMutationOptions<TData, TError, TVariables, TContext>
): UseMutationResult<TData, TError, TVariables, TContext> {
  
  return useMutation<TData, TError, TVariables, TContext>({
    ...options,
    // Offline-first ensures mutations are paused if there is no connection.
    networkMode: "offlineFirst",
    // We inject standard metadata needed by the MutationQueue store
    meta: {
      isQueueable: true,
      mutationType: options.mutationType,
      id: Math.random().toString(36).substring(2, 9) + Date.now().toString(36),
      createdAt: Date.now(),
      isConflict: false,
    } as QueueableMutationMeta,
    onError: (error, variables, context) => {
      // Check for conflict (409)
      const isConflict = error instanceof Error && (error.message.includes("409") || error.message.includes("conflict"));
      
      if (isConflict) {
        // Unfortunately useMutation onError doesn't easily let us modify the meta directly for that exact mutation instance 
        // in a clean way unless we use the global queryClient cache. But we can handle it at the mutation cache level, 
        // or just let the global onError handle it. 
        // For simplicity, we just rely on a global cache interceptor, or we can find the mutation in the cache here:
      }
      
      if (options.onError) {
        (options.onError as any)(error, variables, context);
      }
    },
  });
}

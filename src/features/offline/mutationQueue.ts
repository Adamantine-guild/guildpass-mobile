import { useMutationState, MutationCache } from "@tanstack/react-query";
import { queryClient } from "../../lib/queryClient";

/**
 * Defines the explicit types of mutations in the application.
 * This ensures we never accidentally queue non-queueable actions like access-checks.
 */
export enum MutationType {
  // Queueable
  UPDATE_NOTIFICATION_PREFERENCES = "UPDATE_NOTIFICATION_PREFERENCES",
  
  // Non-queueable (Synchronous only)
  ACCESS_CHECK = "ACCESS_CHECK",
  VERIFY_QR_PAYLOAD = "VERIFY_QR_PAYLOAD",
}

export interface QueueableMutationMeta extends Record<string, unknown> {
  isQueueable: boolean;
  mutationType: MutationType;
  id?: string;
  createdAt?: number;
  // If a mutation hits a conflict (e.g. 409), we mark it as a conflict
  // so the user can manually resolve it.
  isConflict?: boolean;
}

export interface QueuedMutationInfo {
  id: string;
  type: MutationType;
  payload: unknown;
  createdAt: number;
  status: "pending" | "syncing" | "failed" | "conflict";
  error?: Error | null;
}

/**
 * Hook to read the current state of the offline mutation queue.
 * This translates TanStack's internal mutation state into our clear
 * QueuedMutationInfo abstraction for the "Pending Changes" UI.
 */
export function useMutationQueue(): QueuedMutationInfo[] {
  const mutations = useMutationState({
    filters: {
      predicate: (mutation) => {
        const meta = mutation.meta as QueueableMutationMeta | undefined;
        return meta?.isQueueable === true && (mutation.state.status === "pending" || mutation.state.isPaused || mutation.state.status === "error");
      },
    },
  });

  return mutations.map((mutation): QueuedMutationInfo => {
    const meta = mutation.meta as QueueableMutationMeta;
    
    let status: QueuedMutationInfo["status"] = "pending";
    if (mutation.state.status === "pending" && !mutation.state.isPaused) {
      status = "syncing";
    } else if (mutation.state.status === "error") {
      status = meta.isConflict ? "conflict" : "failed";
    }

    return {
      id: meta.id ?? String(mutation.mutationId),
      type: meta.mutationType,
      payload: mutation.state.variables,
      createdAt: meta.createdAt ?? Date.now(),
      status,
      error: mutation.state.error,
    };
  }).sort((a, b) => a.createdAt - b.createdAt);
}

/**
 * Helper to manually remove a failed/conflicted mutation from the queue.
 */
export function removeQueuedMutation(id: string) {
  const cache = queryClient.getMutationCache();
  const mutation = cache.getAll().find((m) => (m.meta as QueueableMutationMeta | undefined)?.id === id);
  if (mutation) {
    cache.remove(mutation);
  }
}

/**
 * Helper to retry a failed/conflicted mutation.
 */
export function retryQueuedMutation(id: string) {
  const cache = queryClient.getMutationCache();
  const mutation = cache.getAll().find((m) => (m.meta as QueueableMutationMeta | undefined)?.id === id);
  if (mutation) {
    // Reset meta.isConflict to false before retry
    if (mutation.meta) {
      (mutation.meta as any).isConflict = false;
    }
    // This will trigger the mutation again if we are online.
    cache.resumePausedMutations();
    // Wait, resumePausedMutations only resumes paused. An errored mutation isn't paused.
    // Instead we can execute it:
    mutation.execute(mutation.state.variables);
  }
}

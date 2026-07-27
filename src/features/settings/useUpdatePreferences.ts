import { useOfflineMutation } from "../offline/useOfflineMutation";
import { MutationType } from "../offline/mutationQueue";
import { useQueryClient } from "@tanstack/react-query";
import {
  applyOptimisticCacheUpdates,
  rollbackOptimisticCacheUpdates,
  type OptimisticMutationContext,
} from "../../lib/optimisticCache";
import {
  buildOptimisticPreferences,
  buildSyncedPreferences,
  preferencesQueryKey,
  type CachedPreferences,
  type PreferencesPayload,
} from "./preferencesCache";

export type { CachedPreferences, PreferencesPayload } from "./preferencesCache";

export type UpdatePreferencesTransport = (
  payload: PreferencesPayload,
) => Promise<CachedPreferences>;

export interface UpdatePreferencesOptions {
  updatePreferences?: UpdatePreferencesTransport;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function defaultUpdatePreferences(payload: PreferencesPayload): Promise<CachedPreferences> {
  if ((payload as PreferencesPayload & { _simulateConflict?: boolean })._simulateConflict) {
    throw new Error("HTTP 409 Conflict: Preferences modified elsewhere.");
  }

  await sleep(1000);
  return buildSyncedPreferences(undefined, payload);
}

export function useUpdatePreferences(options: UpdatePreferencesOptions = {}) {
  const queryClient = useQueryClient();
  const updatePreferences = options.updatePreferences ?? defaultUpdatePreferences;

  return useOfflineMutation<
    CachedPreferences,
    Error,
    PreferencesPayload,
    OptimisticMutationContext
  >({
    mutationType: MutationType.UPDATE_NOTIFICATION_PREFERENCES,
    mutationKey: preferencesQueryKey,
    mutationFn: updatePreferences,
    onMutate: async (payload) => {
      return applyOptimisticCacheUpdates(queryClient, payload, [
        {
          queryKey: preferencesQueryKey,
          updater: (current, variables) =>
            buildOptimisticPreferences(current as CachedPreferences | undefined, variables),
        },
      ]);
    },
    onError: (_error, _variables, context) => {
      rollbackOptimisticCacheUpdates(queryClient, context);
    },
    onSuccess: (preferences) => {
      queryClient.setQueryData(preferencesQueryKey, preferences);
    },
  });
}

import { useOfflineMutation } from "../offline/useOfflineMutation";
import { MutationType } from "../offline/mutationQueue";
import { queryClient } from "../../lib/queryClient";

export interface PreferencesPayload {
  pushNotifications: boolean;
  emailNotifications: boolean;
}

export function useUpdatePreferences() {
  return useOfflineMutation<void, Error, PreferencesPayload>({
    mutationType: MutationType.UPDATE_NOTIFICATION_PREFERENCES,
    mutationFn: async (payload) => {
      // Simulate network request.
      // This will automatically fail and queue if offline due to networkMode: "offlineFirst".
      
      // We can simulate a conflict for testing purposes if payload has a special flag.
      if ((payload as any)._simulateConflict) {
        throw new Error("HTTP 409 Conflict: Preferences modified elsewhere.");
      }
      
      // Simulate delay
      await new Promise((resolve) => setTimeout(resolve, 1000));
      
      // Success
      return;
    },
    onSuccess: () => {
      // Typically we'd invalidate a query here.
      // queryClient.invalidateQueries({ queryKey: ["preferences"] });
    },
  });
}

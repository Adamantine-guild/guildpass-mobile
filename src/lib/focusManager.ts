import { AppState, AppStateStatus } from "react-native";
import { focusManager, QueryClient } from "@tanstack/react-query";
import { appConfig } from "../config/appConfig";
import { queryKeys } from "../lib/queryKeys";

let lastBackgroundTime: number | null = null;
let subscription: { remove: () => void } | null = null;

export function initFocusManager(queryClient: QueryClient): () => void {
  // Clean up any existing subscription first to prevent duplicates
  if (subscription) {
    subscription.remove();
  }

  const handleAppStateChange = (nextAppState: AppStateStatus) => {
    if (nextAppState === "active") {
      // 1. Tell React Query we are back in focus
      focusManager.setFocused(true);

      // 2. Check if we have a recorded background time
      if (lastBackgroundTime !== null) {
        const elapsed = Date.now() - lastBackgroundTime;
        const threshold = appConfig.foregroundRefetchThresholdMs;

        if (elapsed > threshold) {
          // Invalidate membership and user-roles queries to trigger refetch
          void queryClient.invalidateQueries({
            queryKey: queryKeys.membership.all,
            refetchType: "all",
          });
          void queryClient.invalidateQueries({
            queryKey: queryKeys.userRoles.all,
            refetchType: "all",
          });
        }
        // Reset the background time
        lastBackgroundTime = null;
      }
    } else if (nextAppState === "background" || nextAppState === "inactive") {
      // Record when the app goes into the background
      if (lastBackgroundTime === null) {
        lastBackgroundTime = Date.now();
      }
    }
  };

  const appStateSubscription = AppState.addEventListener("change", handleAppStateChange);
  subscription = appStateSubscription;

  return () => {
    appStateSubscription.remove();
    subscription = null;
    lastBackgroundTime = null;
  };
}

export function getLastBackgroundTimeForTest(): number | null {
  return lastBackgroundTime;
}

export function setLastBackgroundTimeForTest(time: number | null): void {
  lastBackgroundTime = time;
}

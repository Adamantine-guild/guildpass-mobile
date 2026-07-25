/**
 * Trigger sources for the sync coordinator (Issue #225).
 *
 * Each trigger is a thin adapter: it observes one platform signal and calls
 * `coordinator.requestSync(reason)`. All policy — coalescing, rate limiting,
 * retry — lives in the coordinator, so adding a trigger can never introduce a
 * second scheduling regime the way useBackgroundSync did.
 *
 * The app-foreground trigger is the one genuinely useful behaviour recovered
 * from the deleted features/notifications/useBackgroundSync.ts. Its OS-level
 * background-fetch counterpart is deliberately not reinstated here: it needs
 * expo-task-manager and expo-background-fetch, neither of which is declared as
 * a dependency, plus a config plugin and a native rebuild.
 */

import { useNetworkStore } from "../network/connectivityService";
import type { SyncCoordinator } from "./syncCoordinator";

/** Mirrors react-native's AppStateStatus without importing it — see below. */
export type AppStateStatus = "active" | "background" | "inactive" | "unknown" | "extension";

type AppStateLike = {
  addEventListener: (
    type: "change",
    listener: (status: AppStateStatus) => void,
  ) => { remove: () => void };
};

/**
 * `react-native` is resolved lazily rather than imported at module scope, and
 * failure to resolve it is tolerated.
 *
 * A static import pulls react-native's Flow-typed sources into the module
 * graph, which the vitest node transform cannot parse ("Unexpected token
 * 'typeof'"), so any test touching syncManager would fail to even collect.
 * Deferring the resolution keeps this module importable, and returning null
 * when it cannot be loaded means the foreground trigger degrades to a no-op
 * instead of taking sync initialisation down with it. On device AppState is
 * always present, so this path is test-environment only.
 */
/** Resolution is memoized: module availability cannot change at runtime, and
 * it keeps the warning below to one line rather than one per subscription. */
let appStateResolution: { value: AppStateLike | null } | null = null;

function getAppState(): AppStateLike | null {
  if (appStateResolution) return appStateResolution.value;

  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const appState = (require("react-native") as { AppState?: AppStateLike }).AppState;
    appStateResolution = { value: appState ?? null };
    if (!appState) {
      warnForegroundTriggerDisabled("react-native resolved without an AppState export");
    }
  } catch (error) {
    appStateResolution = { value: null };
    warnForegroundTriggerDisabled(error instanceof Error ? error.message : String(error));
  }

  return appStateResolution.value;
}

/**
 * A trigger that quietly stops working is worse than one that fails loudly:
 * foreground catch-up going missing would look like "sync is just slow"
 * rather than a bug. On device this should be unreachable, so if it does fire
 * it is a real defect and needs to be visible.
 *
 * Dev-only because the vitest node transform cannot parse react-native's
 * Flow-typed sources, so this path is hit constantly under test.
 */
function warnForegroundTriggerDisabled(reason: string): void {
  if (typeof __DEV__ !== "undefined" && __DEV__) {
    console.warn(
      `[sync] Foreground sync trigger disabled — could not resolve AppState: ${reason}. ` +
        "Sync will still run on reconnect, cache restore and manual retry.",
    );
  }
}

/** NetInfo flaps during connectivity changes; debounce the burst. */
export const SYNC_RECONNECT_DEBOUNCE_MS = 2000;

export type TriggerHandle = () => void;

export type ReconnectTriggerDeps = {
  coordinator: SyncCoordinator;
  debounceMs?: number;
  scheduleTimer?: (fn: () => void, ms: number) => () => void;
  subscribe?: (listener: (state: { isOnline: boolean }) => void) => () => void;
  getInitialOnline?: () => boolean;
};

const defaultScheduleTimer = (fn: () => void, ms: number) => {
  const handle = setTimeout(fn, ms);
  return () => clearTimeout(handle);
};

/** Fires on an offline -> online transition only, not on every network event. */
export function registerReconnectTrigger(deps: ReconnectTriggerDeps): TriggerHandle {
  const { coordinator } = deps;
  const debounceMs = deps.debounceMs ?? SYNC_RECONNECT_DEBOUNCE_MS;
  const scheduleTimer = deps.scheduleTimer ?? defaultScheduleTimer;
  const subscribe =
    deps.subscribe ?? ((listener) => useNetworkStore.subscribe((state) => listener(state)));
  const getInitialOnline =
    deps.getInitialOnline ?? (() => useNetworkStore.getState().isOnline);

  let wasOnline = getInitialOnline();
  let cancelDebounce: (() => void) | null = null;

  const unsubscribe = subscribe((state) => {
    const cameBackOnline = state.isOnline && !wasOnline;
    wasOnline = state.isOnline;
    if (!cameBackOnline) return;

    cancelDebounce?.();
    cancelDebounce = scheduleTimer(() => {
      cancelDebounce = null;
      void coordinator.requestSync("reconnect");
    }, debounceMs);
  });

  return () => {
    cancelDebounce?.();
    cancelDebounce = null;
    unsubscribe();
  };
}

export type ForegroundTriggerDeps = {
  coordinator: SyncCoordinator;
  subscribe?: (listener: (status: AppStateStatus) => void) => () => void;
};

/**
 * Catches up after the app was backgrounded — push delivery is best-effort, so
 * a device that slept through a role change learns about it on return.
 * Rate limiting in the coordinator keeps rapid app switching cheap.
 */
export function registerForegroundTrigger(deps: ForegroundTriggerDeps): TriggerHandle {
  const { coordinator } = deps;
  const subscribe =
    deps.subscribe ??
    ((listener) => {
      const appState = getAppState();
      if (!appState) return () => {};
      const subscription = appState.addEventListener("change", listener);
      return () => subscription.remove();
    });

  const unsubscribe = subscribe((status) => {
    if (status === "active") {
      void coordinator.requestSync("app-foreground");
    }
  });

  return unsubscribe;
}

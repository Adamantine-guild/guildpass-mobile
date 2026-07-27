import { queryKeys } from "../../lib/queryKeys";

export interface PreferencesPayload {
  pushNotifications: boolean;
  emailNotifications: boolean;
}

export type PreferencesSyncStatus = "synced" | "pending" | "error";

export interface CachedPreferences extends PreferencesPayload {
  syncStatus: PreferencesSyncStatus;
  updatedAt: number;
  error?: string;
}

export const preferencesQueryKey = queryKeys.preferences.current;

export const DEFAULT_PREFERENCES: CachedPreferences = {
  pushNotifications: false,
  emailNotifications: false,
  syncStatus: "synced",
  updatedAt: 0,
};

export function buildOptimisticPreferences(
  current: CachedPreferences | undefined,
  payload: PreferencesPayload,
  now: number = Date.now(),
): CachedPreferences {
  return {
    ...(current ?? DEFAULT_PREFERENCES),
    ...payload,
    syncStatus: "pending",
    updatedAt: now,
    error: undefined,
  };
}

export function buildSyncedPreferences(
  current: CachedPreferences | undefined,
  payload: PreferencesPayload,
  now: number = Date.now(),
): CachedPreferences {
  return {
    ...(current ?? DEFAULT_PREFERENCES),
    ...payload,
    syncStatus: "synced",
    updatedAt: now,
    error: undefined,
  };
}

export function buildErroredPreferences(
  current: CachedPreferences | undefined,
  error: Error,
  now: number = Date.now(),
): CachedPreferences {
  return {
    ...(current ?? DEFAULT_PREFERENCES),
    syncStatus: "error",
    updatedAt: now,
    error: error.message,
  };
}

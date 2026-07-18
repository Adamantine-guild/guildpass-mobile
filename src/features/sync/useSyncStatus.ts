/**
 * UI-facing hooks for sync state (Issue #108).
 */

import { useSyncStore } from "./sync.store";
import type { SyncCorrection, SyncStatus } from "./sync.types";

export function useSyncStatus(): {
  status: SyncStatus;
  lastSyncCompletedAt: number | null;
  lastSyncError: string | null;
} {
  const status = useSyncStore((state) => state.status);
  const lastSyncCompletedAt = useSyncStore((state) => state.lastSyncCompletedAt);
  const lastSyncError = useSyncStore((state) => state.lastSyncError);
  return { status, lastSyncCompletedAt, lastSyncError };
}

export function useSyncCorrections(): {
  corrections: SyncCorrection[];
  acknowledgeCorrection: (id: string) => void;
  acknowledgeAllCorrections: () => void;
} {
  const corrections = useSyncStore((state) => state.corrections);
  const acknowledgeCorrection = useSyncStore((state) => state.acknowledgeCorrection);
  const acknowledgeAllCorrections = useSyncStore((state) => state.acknowledgeAllCorrections);
  return { corrections, acknowledgeCorrection, acknowledgeAllCorrections };
}

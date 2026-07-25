/**
 * Push Notification Reconciliation Protocol
 *
 * Exports the public API surface for the reconciliation layer.
 *
 * ## Quick Start
 *
 * ```ts
 * import { useReconciliation, useBackgroundSync } from "src/features/notifications";
 *
 * // In your push notification handler:
 * const { reconcile } = useReconciliation({
 *   onRoleChangeApplied: (result) => {
 *     // Show ONE user-facing notification for genuine changes only
 *     showLocalNotification(result);
 *   },
 * });
 *
 * // On push receipt:
 * await reconcile({ guildId: "...", walletAddress: "..." });
 *
 * // In your root component — enables foreground/background catch-up:
 * useBackgroundSync({
 *   onRoleChangeApplied: (result) => { ... },
 * });
 * ```
 */

export { useReconciliation } from "./useReconciliation";
export {
  useBackgroundSync,
  registerBackgroundSyncTask,
  unregisterBackgroundSyncTask,
  BACKGROUND_SYNC_TASK_NAME,
} from "./useBackgroundSync";
export {
  useReconciliationStore,
  entityCompositeKey,
  parseEntityCompositeKey,
} from "./reconciliation.store";
export type {
  EntityKey,
  RoleChangeSnapshot,
  ReconciliationPersistedState,
  ReconciliationResult,
  PushWakeUpHint,
  OnRoleChangeApplied,
} from "./reconciliation.types";

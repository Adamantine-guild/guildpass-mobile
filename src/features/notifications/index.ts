/**
 * Push Notification Reconciliation Protocol
 *
 * Exports the public API surface for the reconciliation layer.
 *
 * ## Quick Start
 *
 * ```ts
 * import { useReconciliation } from "src/features/notifications";
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
 * ```
 *
 * Foreground/background catch-up is NOT handled here. `useBackgroundSync` was
 * removed in Issue #225: it was a second, never-mounted reconciliation engine
 * with its own scheduling and its own notion of "reconciled". Periodic and
 * foreground catch-up now belong to features/sync/syncCoordinator.
 */

export { useReconciliation } from "./useReconciliation";
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

// Push Notifications
export * from "./pushNotifications.types";
export { usePushNotificationsStore } from "./pushNotifications.store";
export * from "./pushNotifications.service";
export { usePushNotifications } from "./usePushNotifications";
export { PushNotificationRationale } from "./PushNotificationRationale";

/**
 * Defines the types of mutations that can be performed in the application.
 * Explicitly classifies which mutations are safe to queue offline and which must remain synchronous.
 */

export enum MutationType {
  // Queueable mutations
  UPDATE_PREFERENCES = "UPDATE_PREFERENCES",
  UPDATE_PROFILE = "UPDATE_PROFILE",
  SYNC_DRAFT = "SYNC_DRAFT",

  // Synchronous-only mutations
  ACCESS_CHECK = "ACCESS_CHECK",
  VERIFY_WALLET = "VERIFY_WALLET",
  VALIDATE_TOKEN = "VALIDATE_TOKEN",
}

export const QUEUEABLE_MUTATIONS: ReadonlySet<MutationType> = new Set([
  MutationType.UPDATE_PREFERENCES,
  MutationType.UPDATE_PROFILE,
  MutationType.SYNC_DRAFT,
]);

/**
 * Checks if a given mutation type is safe to queue offline.
 * Synchronous-only actions (like access checks) must never be silently queued.
 */
export function isQueueable(type: MutationType): boolean {
  return QUEUEABLE_MUTATIONS.has(type);
}

/**
 * Cross-feature state transitions for connecting and disconnecting a wallet.
 *
 * A feature module owns only its own store. Every write that spans features is
 * declared here or in `resetAppState.ts`, so the fan-out lives in one readable,
 * ordered, awaitable place instead of inline in feature hooks. See the
 * "State Management" section of `docs/architecture.md`.
 */

import { queryClient } from "./queryClient";
import { clearWalletScopedCache } from "./walletScopedCache";
import { useSessionStore } from "../features/session/session.store";
import { useSyncStore } from "../features/sync/sync.store";

export async function startWalletSession(address: string): Promise<void> {
  await useSessionStore.getState().startSession(address);
}

/**
 * Order matters: wallet-scoped queries and sync corrections are dropped before
 * the session is ended. A screen still mounted during teardown would otherwise
 * be able to refetch against a live token and repopulate the cache for the
 * wallet that is on its way out. `tests/walletLifecycle.test.ts` pins this.
 */
export async function endWalletSession(): Promise<void> {
  clearWalletScopedCache(queryClient);
  useSyncStore.getState().clearSyncState();
  await useSessionStore.getState().endSession();
}

/**
 * Session invalidation after a device-integrity compromise under the "block"
 * policy. Deliberately narrower than `endWalletSession`: it does not clear the
 * wallet-scoped cache, matching the behaviour that shipped before this module
 * existed. Widening it is a security change, tracked separately.
 */
export async function invalidateSessionForCompromise(): Promise<void> {
  await useSessionStore.getState().endSession();
}

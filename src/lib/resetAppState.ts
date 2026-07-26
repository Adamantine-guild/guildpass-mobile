import { queryClient } from "./queryClient";
import { asyncStoragePersister } from "./queryPersister";
import { useWalletStore } from "../features/wallet/wallet.store";
import { useSessionStore } from "../features/session/session.store";
import { useAccessHistoryStore } from "../features/access/accessHistory.store";
import { useSyncStore } from "../features/sync/sync.store";
import { useReconciliationStore } from "../features/notifications/reconciliation.store";
import { clearAllAttestations } from "../features/attestation/attestationStorage";
import { clearIssuerKeyCache } from "../features/attestation/issuerKeyRegistry";

export async function resetAppState(): Promise<void> {
  useWalletStore.getState().disconnect();
  await useSessionStore.getState().endSession();
  useAccessHistoryStore.getState().clearHistory();
  useSyncStore.getState().clearSyncState();
  useReconciliationStore.getState().clearAll();
  queryClient.clear();
  await Promise.all([
    useWalletStore.persist.clearStorage(),
    useSessionStore.persist.clearStorage(),
    useSyncStore.persist.clearStorage(),
    useReconciliationStore.persist.clearStorage(),
    clearAllAttestations(),
    clearIssuerKeyCache(),
    asyncStoragePersister.removeClient(),
  ]);
}

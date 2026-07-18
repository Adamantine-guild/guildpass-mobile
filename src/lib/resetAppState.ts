import { queryClient } from "./queryClient";
import { asyncStoragePersister } from "./queryPersister";
import { useWalletStore } from "../features/wallet/wallet.store";
import { useSessionStore } from "../features/session/session.store";
import { useAccessHistoryStore } from "../features/access/accessHistory.store";
import { useSyncStore } from "../features/sync/sync.store";

export async function resetAppState(): Promise<void> {
  useWalletStore.getState().disconnect();
  await useSessionStore.getState().endSession();
  await useAccessHistoryStore.getState().clearAllHistory();
  useSyncStore.getState().clearSyncState();
  queryClient.clear();
  await asyncStoragePersister.removeClient();
}

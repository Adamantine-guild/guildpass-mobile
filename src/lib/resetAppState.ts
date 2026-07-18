import { queryClient } from "./queryClient";
import { asyncStoragePersister } from "./queryPersister";
import { useWalletStore } from "../features/wallet/wallet.store";
import { useSessionStore } from "../features/session/session.store";
import { useAccessHistoryStore } from "../features/access/accessHistory.store";
import { getEmbeddedWalletProvider } from "../features/wallet/embeddedWallet.provider";

export async function resetAppState(): Promise<void> {
  useWalletStore.getState().disconnect();
  await getEmbeddedWalletProvider().logout();
  await useSessionStore.getState().endSession();
  await useAccessHistoryStore.getState().clearAllHistory();
  queryClient.clear();
  await asyncStoragePersister.removeClient();
}

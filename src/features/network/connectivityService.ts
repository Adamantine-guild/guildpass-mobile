import NetInfo from "@react-native-community/netinfo";
import { onlineManager } from "@tanstack/react-query";
import { create } from "zustand";

interface NetworkState {
  isOnline: boolean;
  isOffline: boolean;
  setOnline: (isOnline: boolean) => void;
}

export const useNetworkStore = create<NetworkState>((set) => ({
  isOnline: true,
  isOffline: false,
  setOnline: (isOnline) => set({ isOnline, isOffline: !isOnline }),
}));

let isInitialized = false;

export function initConnectivityService() {
  if (isInitialized) return;
  isInitialized = true;

  // Sync React Query's onlineManager with NetInfo status
  onlineManager.setEventListener((setOnline) => {
    const unsubscribe = NetInfo.addEventListener((state) => {
      const online = !!state.isConnected && state.isInternetReachable !== false;
      setOnline(online);
      useNetworkStore.getState().setOnline(online);
    });

    // Fetch initial state asynchronously
    void NetInfo.fetch().then((state) => {
      const online = !!state.isConnected && state.isInternetReachable !== false;
      setOnline(online);
      useNetworkStore.getState().setOnline(online);
    });

    return unsubscribe;
  });
}

export function resetConnectivityServiceForTest() {
  isInitialized = false;
}

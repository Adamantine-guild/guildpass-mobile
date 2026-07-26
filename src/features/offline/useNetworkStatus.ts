import { useNetworkStore } from "../network/connectivityService";

export function useNetworkStatus() {
  const isOnline = useNetworkStore((state) => state.isOnline);
  const isOffline = useNetworkStore((state) => state.isOffline);

  return {
    isOnline,
    isOffline,
  };
}

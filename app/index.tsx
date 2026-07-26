import { Redirect } from "expo-router";
import { useWallet } from "../src/features/wallet/useWallet";
import { LoadingState } from "../src/components/LoadingState";

export default function Index() {
  const { isConnected, isHydrated } = useWallet();

  if (!isHydrated) {
    return <LoadingState message="Restoring wallet..." />;
  }

  if (!isConnected) {
    return <Redirect href="/onboarding" />;
  }

  return <Redirect href="/profile" />;
}

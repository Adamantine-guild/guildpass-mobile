import { Redirect } from "expo-router";
import { useWallet } from "../src/features/wallet/useWallet";

export default function Index() {
  const { isConnected } = useWallet();

  if (!isConnected) {
    return <Redirect href="/onboarding" />;
  }

  return <Redirect href="/profile" />;
}

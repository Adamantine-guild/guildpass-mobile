import { View, Text } from "react-native";
import React, { useEffect } from "react";
import { useRouter } from "expo-router";
import { useWallet } from "../features/wallet/useWallet";
import { Button } from "./Button";

interface WalletRequiredProps {
  children: React.ReactNode;
  redirect?: boolean;
}

export function WalletRequired({
  children,
  redirect = true,
}: WalletRequiredProps) {
  const { isConnected, isHydrated } = useWallet();
  const router = useRouter();

  useEffect(() => {
    if (isHydrated && !isConnected && redirect) {
      router.replace("/profile");
    }
  }, [isHydrated, isConnected, redirect, router]);

  if (!isHydrated) {
    return null;
  }

  if (!isConnected) {
    if (redirect) {
      return null;
    }

    return (
      <View
        className="flex-1 justify-center items-center p-6 bg-background"
        testID="wallet-required-prompt"
      >
        <Text className="text-text text-xl font-bold text-center mb-3">
          Wallet connection required
        </Text>
        <Text className="text-text-muted text-center mb-8">
          Please connect your wallet to access this screen.
        </Text>
        <Button
          title="Connect Wallet"
          onPress={() => router.replace("/profile")}
          testID="wallet-required-connect"
        />
      </View>
    );
  }

  return <>{children}</>;
}

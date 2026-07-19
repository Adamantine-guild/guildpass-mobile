import { View, Text, ScrollView, TouchableOpacity } from "react-native";
import React, { useState } from "react";
import { useRouter } from "expo-router";
import { useWallet } from "../src/features/wallet/useWallet";
import { useWalletConnectModal } from "../src/features/wallet/WalletConnectProvider";
import { useWalletStore } from "../src/features/wallet/wallet.store";
import { AppHeader } from "../src/components/AppHeader";
import { Card } from "../src/components/Card";
import { WalletInput } from "../src/components/WalletInput";
import { Button } from "../src/components/Button";
import { StaleDataBanner } from "../src/components/StaleDataBanner";
import { useNetworkStatus } from "../src/features/offline/useNetworkStatus";

const CONNECTION_LABELS: Record<string, string> = {
  walletconnect: "WalletConnect",
  manual: "Manual Entry",
  coinbase: "Coinbase Wallet",
  metamask: "MetaMask",
};

export default function Profile() {
  const router = useRouter();
  const { walletAddress, isConnected, connectionKind, connectManually, disconnect } = useWallet();
  const { open } = useWalletConnectModal();
  const { isOffline } = useNetworkStatus();
  const [inputValue, setInputValue] = useState(walletAddress || "");
  const [error, setError] = useState<string | null>(null);
  const [showManualEntry, setShowManualEntry] = useState(false);
  const [wcConnecting, setWcConnecting] = useState(false);

  // ── WalletConnect flow ──────────────────────────────────────────────
  const handleWalletConnect = async () => {
    setWcConnecting(true);
    setError(null);
    try {
      await open();
      // The WalletConnectBridge in WalletConnectProvider syncs the connected
      // address into Zustand + starts the session automatically.
      // Give the bridge a tick to process before checking the store.
      await new Promise((resolve) => setTimeout(resolve, 300));
      if (!useWalletStore.getState().isConnected) {
        setError("Connection cancelled or rejected.");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to open WalletConnect");
    } finally {
      setWcConnecting(false);
    }
  };

  // ── Manual entry flow ───────────────────────────────────────────────
  const handleConnect = () => {
    const { success, error: validationError } = connectManually(inputValue);
    if (!success) {
      setError(validationError ?? "Invalid address");
      return;
    }
    setError(null);
    router.push("/guilds");
  };

  // ── Disconnect flow ─────────────────────────────────────────────────
  const handleDisconnect = async () => {
    await disconnect();
  };

  return (
    <View className="flex-1 bg-background" testID="profile-screen">
      <AppHeader title="Profile" />
      <ScrollView className="flex-1 px-4 py-6">
        {isOffline ? <StaleDataBanner reason="offline" /> : null}
        {!isConnected ? (
          <View testID="wallet-connect-form">
            <Text className="text-2xl font-bold text-text mb-2">Connect Wallet</Text>
            <Text className="text-text-muted mb-8">
              Connect your wallet to view your memberships and roles.
            </Text>

            {/* ── WalletConnect primary CTA ── */}
            <Card className="mb-6">
              <View className="flex-row items-center mb-4">
                <View className="w-10 h-10 bg-primary/10 rounded-full items-center justify-center mr-3">
                  <Text className="text-primary text-lg">🔗</Text>
                </View>
                <View className="flex-1">
                  <Text className="text-lg font-bold text-text">WalletConnect</Text>
                  <Text className="text-text-muted text-sm">
                    Connect with MetaMask, Trust Wallet, Rainbow & more
                  </Text>
                </View>
              </View>
              <Button
                title={wcConnecting ? "Opening WalletConnect…" : "Connect with WalletConnect"}
                onPress={handleWalletConnect}
                loading={wcConnecting}
                testID="walletconnect-connect-button"
              />
            </Card>

            {/* ── Divider ── */}
            <View className="flex-row items-center mb-6">
              <View className="flex-1 h-px bg-border" />
              <Text className="mx-4 text-text-muted text-sm">or</Text>
              <View className="flex-1 h-px bg-border" />
            </View>

            {/* ── Manual entry fallback ── */}
            {!showManualEntry ? (
              <TouchableOpacity
                onPress={() => setShowManualEntry(true)}
                className="items-center py-3"
                accessibilityRole="button"
                accessibilityLabel="Enter wallet address manually"
                testID="show-manual-entry-button"
              >
                <Text className="text-primary font-medium">Enter address manually</Text>
              </TouchableOpacity>
            ) : (
              <Card className="mb-8">
                <WalletInput
                  value={inputValue}
                  onChangeText={(text) => {
                    setInputValue(text);
                    setError(null);
                  }}
                  error={error}
                  testID="wallet-address-input"
                />
                <Button
                  title="Continue"
                  onPress={handleConnect}
                  className="mt-6"
                  testID="wallet-connect-button"
                />
                <TouchableOpacity
                  onPress={() => {
                    setShowManualEntry(false);
                    setError(null);
                  }}
                  className="items-center mt-4 py-2"
                  testID="hide-manual-entry-button"
                >
                  <Text className="text-text-muted text-sm">Cancel</Text>
                </TouchableOpacity>
              </Card>
            )}
          </View>
        ) : (
          <View testID="profile-connected">
            <Card className="mb-6">
              <Text className="text-text-muted text-sm mb-1">
                CONNECTED WALLET
                {connectionKind ? ` · ${CONNECTION_LABELS[connectionKind] ?? connectionKind}` : ""}
              </Text>
              <Text
                className="text-lg font-bold text-text mb-4"
                numberOfLines={1}
                testID="connected-wallet-address"
              >
                {walletAddress}
              </Text>
              <Button
                title="Disconnect"
                onPress={handleDisconnect}
                variant="outline"
                testID="wallet-disconnect-button"
              />
            </Card>

            <View>
              <TouchableOpacity
                onPress={() => router.push("/guilds")}
                activeOpacity={0.7}
                className="mb-4"
                accessibilityRole="link"
                accessibilityLabel="My Guilds"
                accessibilityHint="View your memberships and roles"
                testID="navigate-guilds-button"
              >
                <Card className="flex-row justify-between items-center">
                  <View>
                    <Text className="text-xl font-bold text-text">My Guilds</Text>
                    <Text className="text-text-muted">View your memberships and roles</Text>
                  </View>
                  <Text className="text-primary text-2xl">→</Text>
                </Card>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => router.push("/access-check")}
                activeOpacity={0.7}
                className="mb-4"
                accessibilityRole="link"
                accessibilityLabel="Access Check"
                accessibilityHint="Verify resource access status"
                testID="navigate-access-check-button"
              >
                <Card className="flex-row justify-between items-center">
                  <View>
                    <Text className="text-xl font-bold text-text">Access Check</Text>
                    <Text className="text-text-muted">Verify resource access status</Text>
                  </View>
                  <Text className="text-primary text-2xl">→</Text>
                </Card>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => router.push("/settings")}
                activeOpacity={0.7}
                className="mb-4"
                accessibilityRole="link"
                accessibilityLabel="App Settings"
                accessibilityHint="Configuration and info"
                testID="navigate-settings-button"
              >
                <Card className="flex-row justify-between items-center">
                  <View>
                    <Text className="text-xl font-bold text-text">App Settings</Text>
                    <Text className="text-text-muted">Configuration and info</Text>
                  </View>
                  <Text className="text-primary text-2xl">→</Text>
                </Card>
              </TouchableOpacity>
            </View>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

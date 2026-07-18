import { View, Text, ScrollView, TextInput } from "react-native";
import React, { useEffect, useState } from "react";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useWallet } from "../src/features/wallet/useWallet";
import { useAccessCheck } from "../src/features/access/useAccessCheck";
import type { ParsedAccessQrPayload } from "../src/features/access/qrPayload";
import { parseAccessQrPayload } from "../src/features/access/qrPayload";
import { AppHeader } from "../src/components/AppHeader";
import { Card } from "../src/components/Card";
import { Button } from "../src/components/Button";
import { WalletInput } from "../src/components/WalletInput";
import { AccessStatusCard } from "../src/components/AccessStatusCard";
import { LoadingState } from "../src/components/LoadingState";
import { AccessHistoryList } from "../src/components/AccessHistoryList";
import { validateAndNormalizeAddress } from "../src/lib/walletValidation";
import { useAccessHistoryStore } from "../src/features/access/accessHistory.store";
import { useNetworkStatus } from "../src/features/offline/useNetworkStatus";
import { StaleDataBanner } from "../src/components/StaleDataBanner";
import { BiometricGate } from "../src/features/security/BiometricGate";

export default function AccessCheck() {
  const router = useRouter();
  const { qrPayload } = useLocalSearchParams<{ qrPayload?: string | string[] }>();
  const { walletAddress: currentWallet } = useWallet();
  const [address, setAddress] = useState(currentWallet || "");
  const [guildId, setGuildId] = useState("");
  const [resourceId, setResourceId] = useState("");
  const [scanError, setScanError] = useState<string | null>(null);
  const [scannedPayload, setScannedPayload] = useState<ParsedAccessQrPayload | null>(null);
  const [addressError, setAddressError] = useState<string | null>(null);
  const [guildIdError, setGuildIdError] = useState<string | null>(null);
  const [resourceIdError, setResourceIdError] = useState<string | null>(null);
  const { isOffline } = useNetworkStatus();

  const accessCheck = useAccessCheck();
  const {
    data: result,
    error,
    isPending,
    mutate: runAccessCheck,
    reset: resetAccessCheck,
  } = accessCheck;
  const hydrateHistory = useAccessHistoryStore((state) => state.hydrate);
  const recordCheck = useAccessHistoryStore((state) => state.recordCheck);
  const clearWalletHistory = useAccessHistoryStore((state) => state.clearWalletHistory);
  const historyWallet = currentWallet || address;
  const accessHistory = useAccessHistoryStore((state) => state.getHistoryForWallet(historyWallet));

  useEffect(() => {
    void hydrateHistory();
  }, [hydrateHistory]);

  useEffect(() => {
    setAddress(currentWallet || "");
    setAddressError(null);
    resetAccessCheck();
  }, [currentWallet, resetAccessCheck]);

  const resetCompletedCheck = () => {
    if (result || error) {
      resetAccessCheck();
    }
  };

  useEffect(() => {
    const rawPayload = Array.isArray(qrPayload) ? qrPayload[0] : qrPayload;

    if (!rawPayload) {
      return;
    }

    try {
      const parsedPayload = parseAccessQrPayload(rawPayload);

      setGuildId(parsedPayload.guildId);
      setResourceId(parsedPayload.resourceId);
      setAddress(parsedPayload.walletAddress ?? currentWallet ?? "");
      setScannedPayload(parsedPayload);
      setScanError(null);
      setAddressError(null);
      resetAccessCheck();
    } catch (error) {
      setScanError(error instanceof Error ? error.message : "Unable to read QR payload.");
      setScannedPayload(null);
      resetAccessCheck();
    }
  }, [currentWallet, qrPayload, resetAccessCheck]);

  const handleAddressChange = (nextAddress: string) => {
    setAddress(nextAddress);
    setAddressError(null);
    resetCompletedCheck();
  };

  const handleGuildIdChange = (nextGuildId: string) => {
    setGuildId(nextGuildId);
    setGuildIdError(null);
    resetCompletedCheck();
  };

  const handleResourceIdChange = (nextResourceId: string) => {
    setResourceId(nextResourceId);
    setResourceIdError(null);
    resetCompletedCheck();
  };

  const handleCheck = () => {
    const trimmedGuildId = guildId.trim();
    const trimmedResourceId = resourceId.trim();
    let hasError = false;

    if (!trimmedGuildId) {
      setGuildIdError("Guild ID is required");
      hasError = true;
    } else {
      setGuildIdError(null);
    }

    if (!trimmedResourceId) {
      setResourceIdError("Resource ID is required");
      hasError = true;
    } else {
      setResourceIdError(null);
    }

    if (!address || !trimmedGuildId || !trimmedResourceId) {
      return;
    }

    const validation = validateAndNormalizeAddress(address);
    if (!validation.valid) {
      setAddressError(validation.error);
      resetAccessCheck();
      return;
    }

    const params = {
      walletAddress: validation.address,
      guildId: trimmedGuildId,
      resourceId: trimmedResourceId,
    };

    setAddress(validation.address);
    setAddressError(null);
    resetAccessCheck();
    runAccessCheck(params, {
      onSuccess: (data) => {
        void recordCheck({ ...params, result: data });
      },
      onError: (error) => {
        void recordCheck({ ...params, error });
      },
    });
  };

  return (
    <View className="flex-1 bg-background" testID="access-check-screen">
      <AppHeader title="Access Check" showBack />
      <ScrollView className="flex-1 px-4 py-6">
        {isOffline ? <StaleDataBanner reason="offline" cautionary /> : null}
        <Card className="mb-6">
          <WalletInput
            value={address}
            onChangeText={handleAddressChange}
            placeholder="Wallet address (0x...)"
            error={addressError}
            testID="access-check-wallet-input"
          />

          <Button
            title="Scan QR Code"
            onPress={() => router.push("/access-scanner")}
            variant="outline"
            className="mt-4"
            testID="scan-qr-button"
          />

          <View className="mt-4">
            <Text className="text-text-muted mb-2 font-medium">Guild ID</Text>
            <TextInput
              value={guildId}
              onChangeText={handleGuildIdChange}
              placeholder="e.g. alpha-guild"
              className={`bg-white border ${guildIdError ? "border-error" : "border-border"} rounded-xl p-4 text-text text-lg`}
              accessibilityLabel="Guild ID"
              accessibilityHint="Enter the guild identifier"
              testID="access-check-guild-id-input"
            />
            {guildIdError && <Text className="text-error text-sm mt-1">{guildIdError}</Text>}
          </View>

          <View className="mt-4">
            <Text className="text-text-muted mb-2 font-medium">Resource ID</Text>
            <TextInput
              value={resourceId}
              onChangeText={handleResourceIdChange}
              placeholder="e.g. secret-channel"
              className={`bg-white border ${resourceIdError ? "border-error" : "border-border"} rounded-xl p-4 text-text text-lg`}
              accessibilityLabel="Resource ID"
              accessibilityHint="Enter the resource identifier"
              testID="access-check-resource-id-input"
            />
            {resourceIdError && <Text className="text-error text-sm mt-1">{resourceIdError}</Text>}
          </View>

          <Button
            title="Check Access"
            onPress={handleCheck}
            className="mt-6"
            loading={isPending}
            disabled={!address || !guildId.trim() || !resourceId.trim() || !!addressError || !!guildIdError || !!resourceIdError || isOffline}
          />
        </Card>

        {scanError && (
          <Card className="mb-6 border-error bg-error/5">
            <Text className="text-error font-bold">QR code rejected</Text>
            <Text className="text-error/80 text-sm mt-1">{scanError}</Text>
          </Card>
        )}

        {scannedPayload && !scanError && (
          <Card className="mb-6 border-success/30">
            <Text className="text-success font-bold mb-3">Scanned access details</Text>
            <View className="flex-row justify-between py-1">
              <Text className="text-text-muted">Guild ID</Text>
              <Text className="text-text font-medium">{scannedPayload.guildId}</Text>
            </View>
            <View className="flex-row justify-between py-1">
              <Text className="text-text-muted">Resource ID</Text>
              <Text className="text-text font-medium">{scannedPayload.resourceId}</Text>
            </View>
            {scannedPayload.expiresAt && (
              <View className="flex-row justify-between py-1">
                <Text className="text-text-muted">Expires</Text>
                <Text className="text-text font-medium">{scannedPayload.expiresAt}</Text>
              </View>
            )}
          </Card>
        )}

        {isPending && <LoadingState message="Checking protocol permissions..." />}

        {(result || error) && (
          <BiometricGate
            promptMessage="Authenticate to view access result"
            onCancel={() => {
              resetAccessCheck();
            }}
          >
            {result && (
              <View className="mb-12">
                <AccessStatusCard
                  hasAccess={result.hasAccess}
                  reason={result.reason}
                  matchedRoles={result.matchedRoles}
                  requiredRoles={result.requiredRoles}
                />
              </View>
            )}

            {error && !result && (
              <Card
                className="border-error bg-error/5"
                accessibilityRole="alert"
                accessibilityLabel="Error checking access. Please verify your inputs and try again."
              >
                <Text className="text-error font-bold">Error checking access</Text>
                <Text className="text-error/80 text-sm mt-1">
                  Please verify your inputs and try again.
                </Text>
              </Card>
            )}
          </BiometricGate>
        )}

        <AccessHistoryList
          entries={accessHistory}
          onClear={() => {
            void clearWalletHistory(historyWallet);
          }}
        />
      </ScrollView>
    </View>
  );
}

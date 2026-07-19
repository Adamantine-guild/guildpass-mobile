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
import { areWalletAddressesEqual, validateAndNormalizeAddress } from "../src/lib/walletValidation";
import { useAccessHistoryStore } from "../src/features/access/accessHistory.store";
import { useNetworkStatus } from "../src/features/offline/useNetworkStatus";
import { StaleDataBanner } from "../src/components/StaleDataBanner";
import { BiometricGate } from "../src/features/security/BiometricGate";
import { useGuilds } from "../src/features/guilds/useGuilds";

export default function AccessCheck() {
  const router = useRouter();
  const { qrPayload } = useLocalSearchParams<{ qrPayload?: string | string[] }>();
  const { walletAddress: currentWallet } = useWallet();
  const [address, setAddress] = useState(currentWallet || "");
  const [guildId, setGuildId] = useState("");
  const [resourceId, setResourceId] = useState("");
  const [scanError, setScanError] = useState<string | null>(null);
  const [scannedPayload, setScannedPayload] = useState<ParsedAccessQrPayload | null>(null);
  const [walletWarningDecision, setWalletWarningDecision] = useState<
    "connected" | "scanned" | "dismissed" | null
  >(null);
  const [addressError, setAddressError] = useState<string | null>(null);
  const [guildIdError, setGuildIdError] = useState<string | null>(null);
  const [resourceIdError, setResourceIdError] = useState<string | null>(null);
  const { isOffline } = useNetworkStatus();

  const guilds = useGuilds();
  const guildQuery = guilds.useGuild(guildId);
  const accessCheck = useAccessCheck();
  const {
    data: result,
    error,
    isPending,
    mutate: runAccessCheck,
    reset: resetAccessCheck,
  } = accessCheck;
  const recordCheck = useAccessHistoryStore((state) => state.recordCheck);

  useEffect(() => {
    setAddress(currentWallet || "");
    setWalletWarningDecision(null);
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
      setWalletWarningDecision(null);
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
    setWalletWarningDecision(null);
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

  const handleUseConnectedWallet = () => {
    if (currentWallet) {
      setAddress(currentWallet);
    }
    setWalletWarningDecision("connected");
    setAddressError(null);
    resetCompletedCheck();
  };

  const handleContinueWithScannedWallet = () => {
    if (scannedPayload?.walletAddress) {
      setAddress(scannedPayload.walletAddress);
    }
    setWalletWarningDecision("scanned");
    setAddressError(null);
    resetCompletedCheck();
  };

  const handleDismissWalletWarning = () => {
    setWalletWarningDecision("dismissed");
    resetCompletedCheck();
  };

  const walletMismatchWarning = (() => {
    if (!scannedPayload?.walletAddress || !currentWallet) {
      return null;
    }

    if (walletWarningDecision !== null) {
      return null;
    }

    if (areWalletAddressesEqual(currentWallet, scannedPayload.walletAddress)) {
      return null;
    }

    return "This QR payload uses a different wallet address from your connected wallet. Review the wallet before continuing.";
  })();

  const handleCheck = () => {
    const trimmedGuildId = guildId.trim();
    const trimmedResourceId = resourceId.trim();

    if (!trimmedGuildId) {
      setGuildIdError("Guild ID is required");
    } else {
      setGuildIdError(null);
    }

    if (!trimmedResourceId) {
      setResourceIdError("Resource ID is required");
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
        recordCheck({
          ...params,
          guildName: guildQuery.data?.name ?? params.guildId,
          resourceName: params.resourceId,
          result: data,
        });
      },
      onError: (error) => {
        recordCheck({
          ...params,
          guildName: guildQuery.data?.name ?? params.guildId,
          resourceName: params.resourceId,
          error,
        });
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

        {walletMismatchWarning && (
          <Card
            className="mb-6 border-primary/30 bg-primary/5"
            accessibilityRole="alert"
            accessibilityLabel="Wallet address mismatch warning. This QR payload uses a different wallet address from your connected wallet."
          >
            <Text className="text-primary font-bold">Wallet address mismatch</Text>
            <Text className="text-text text-sm mt-2">{walletMismatchWarning}</Text>
            <View className="mt-4">
              <Button
                title="Use connected wallet"
                onPress={handleUseConnectedWallet}
                variant="outline"
                className="mb-2"
              />
              <Button
                title="Continue with scanned wallet"
                onPress={handleContinueWithScannedWallet}
                variant="primary"
                className="mb-2"
              />
              <Button title="Cancel" onPress={handleDismissWalletWarning} variant="secondary" />
            </View>
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
      </ScrollView>
    </View>
  );
}

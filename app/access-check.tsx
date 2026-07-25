import { View, Text, ScrollView, TextInput } from "react-native";
import React, { useEffect, useState } from "react";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useWallet } from "../src/features/wallet/useWallet";
import { useAccessCheck } from "../src/features/access/useAccessCheck";
import { useCountdown } from "../src/features/access/useCountdown";
import type { ParsedAccessQrPayload } from "../src/features/access/qrPayload";
import { parseAccessQrPayload } from "../src/features/access/qrPayload";
import { AppHeader } from "../src/components/AppHeader";
import { Card } from "../src/components/Card";
import { Button } from "../src/components/Button";
import { WalletInput } from "../src/components/WalletInput";
import { AccessStatusCard } from "../src/components/AccessStatusCard";
import { AccessStatusCardSkeleton } from "../src/components/AccessStatusCardSkeleton";
import { areWalletAddressesEqual, validateAndNormalizeAddress } from "../src/lib/walletValidation";
import { useAccessHistoryStore } from "../src/features/access/accessHistory.store";
import { useNetworkStatus } from "../src/features/offline/useNetworkStatus";
import { StaleDataBanner } from "../src/components/StaleDataBanner";
import { ErrorState } from "../src/components/ErrorState";
import { BiometricGate } from "../src/features/security/BiometricGate";
import { useGuilds } from "../src/features/guilds/useGuilds";
import type { PerChainRoleEligibilityResolution } from "../src/features/access/roleEligibilityResolver";

const statusCopy: Record<PerChainRoleEligibilityResolution["status"], string> = {
  resolved: "Resolved",
  "timed-out": "Timed out",
  error: "Error",
};

const statusClassName: Record<PerChainRoleEligibilityResolution["status"], string> = {
  resolved: "bg-success/10 text-success border-success/30",
  "timed-out": "bg-amber-100 text-amber-700 border-amber-300",
  error: "bg-error/10 text-error border-error/30",
};

function PerChainEligibilityList({
  perChainRoleEligibility,
  isResolvingRoleEligibility,
  roleEligibilityError,
}: {
  perChainRoleEligibility: PerChainRoleEligibilityResolution[];
  isResolvingRoleEligibility: boolean;
  roleEligibilityError?: string;
}) {
  if (
    perChainRoleEligibility.length === 0 &&
    !isResolvingRoleEligibility &&
    !roleEligibilityError
  ) {
    return null;
  }

  return (
    <Card className="mt-4 border-border" testID="per-chain-eligibility-list">
      <View className="flex-row items-center justify-between mb-3">
        <Text className="text-text font-bold">Per-chain role eligibility</Text>
        {isResolvingRoleEligibility ? (
          <Text className="text-primary text-xs font-semibold" testID="per-chain-eligibility-loading">
            Resolving
          </Text>
        ) : null}
      </View>

      {roleEligibilityError ? (
        <Text className="text-error text-sm mb-3" testID="per-chain-eligibility-error">
          {roleEligibilityError}
        </Text>
      ) : null}

      {perChainRoleEligibility.map((chain) => (
        <View
          key={`${chain.chainId}-${chain.status}`}
          className="border border-border rounded-xl p-3 mb-2"
          testID={`per-chain-eligibility-row-${chain.chainId}`}
        >
          <View className="flex-row items-center justify-between">
            <Text className="text-text font-semibold">Chain {chain.chainId}</Text>
            <Text
              className={`px-2 py-1 rounded-full border text-xs font-semibold ${statusClassName[chain.status]}`}
            >
              {statusCopy[chain.status]}
            </Text>
          </View>
          {chain.resolvedRoles && chain.resolvedRoles.length > 0 ? (
            <Text className="text-text-muted text-xs mt-2">
              Roles: {chain.resolvedRoles.join(", ")}
            </Text>
          ) : null}
          {chain.errorMessage ? (
            <Text className="text-error text-xs mt-2">{chain.errorMessage}</Text>
          ) : null}
        </View>
      ))}
    </Card>
  );
}

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
  const countdown = useCountdown(scannedPayload?.expiresAt);

  const guilds = useGuilds();
  const guildQuery = guilds.useGuild(guildId);
  const accessCheck = useAccessCheck();
  const {
    data: result,
    error,
    isPending,
    mutate: runAccessCheck,
    reset: resetAccessCheck,
    perChainRoleEligibility,
    isResolvingRoleEligibility,
    roleEligibilityError,
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

  const submitAccessCheck = (nextAddress: string, nextGuildId: string, nextResourceId: string) => {
    if (countdown.isExpired) {
      return;
    }

    const trimmedGuildId = nextGuildId.trim();
    const trimmedResourceId = nextResourceId.trim();

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

    if (!nextAddress || !trimmedGuildId || !trimmedResourceId) {
      return;
    }

    const validation = validateAndNormalizeAddress(nextAddress);
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
          resourceName: params.resourceId,
          result: data,
        });
      },
      onError: (error) => {
        recordCheck({
          ...params,
          resourceName: params.resourceId,
          error,
        });
      },
    });
  };

  const handleCheck = () => {
    submitAccessCheck(address, guildId, resourceId);
  };

  const handleRetryAccessCheck = () => {
    submitAccessCheck(address, guildId, resourceId);
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
            disabled={
              !address ||
              !guildId.trim() ||
              !resourceId.trim() ||
              !!addressError ||
              !!guildIdError ||
              !!resourceIdError ||
              isOffline ||
              countdown.isExpired
            }
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
          <Card
            className={`mb-6 ${
              countdown.isExpired
                ? "border-error bg-error/5"
                : countdown.isExpiringSoon
                  ? "border-amber-400 bg-amber-50"
                  : "border-success/30"
            }`}
          >
            <Text
              className={`font-bold mb-3 ${
                countdown.isExpired
                  ? "text-error"
                  : countdown.isExpiringSoon
                    ? "text-amber-700"
                    : "text-success"
              }`}
            >
              {countdown.isExpired ? "Scanned access expired" : "Scanned access details"}
            </Text>
            <View className="flex-row justify-between py-1">
              <Text className="text-text-muted">Guild ID</Text>
              <Text className="text-text font-medium">{scannedPayload.guildId}</Text>
            </View>
            <View className="flex-row justify-between py-1">
              <Text className="text-text-muted">Resource ID</Text>
              <Text className="text-text font-medium">{scannedPayload.resourceId}</Text>
            </View>
            {scannedPayload.expiresAt && (
              <View
                className="flex-row justify-between py-1"
                accessibilityLiveRegion={countdown.isExpired ? "assertive" : "none"}
                accessibilityRole={countdown.isExpired ? "alert" : undefined}
              >
                <Text className="text-text-muted">Validity</Text>
                <Text
                  className={`font-medium ${
                    countdown.isExpired
                      ? "text-error"
                      : countdown.isExpiringSoon
                        ? "text-amber-700"
                        : "text-text"
                  }`}
                  testID="access-expiration-countdown"
                >
                  {countdown.label}
                </Text>
              </View>
            )}
          </Card>
        )}

        {isPending && <AccessStatusCardSkeleton />}

        {(result || error) && (
          <BiometricGate
            promptMessage="Authenticate to view access result"
            onCancel={() => {
              resetAccessCheck();
            }}
          >
            {countdown.isExpired && scannedPayload?.expiresAt && (
              <Card className="mb-12 border-2 border-error bg-error/5" accessibilityRole="alert">
                <View className="items-center">
                  <View className="w-16 h-16 rounded-full items-center justify-center mb-4 bg-error">
                    <Text className="text-white text-3xl">!</Text>
                  </View>
                  <Text className="text-2xl font-bold text-error">Expired</Text>
                  <Text className="text-text-muted mt-2 text-center">
                    This access result is no longer valid. Scan a new QR code to continue.
                  </Text>
                </View>
              </Card>
            )}

            {result && !countdown.isExpired && (
              <View className="mb-12">
                <AccessStatusCard
                  hasAccess={result.hasAccess}
                  reason={result.reason}
                  matchedRoles={result.matchedRoles}
                  requiredRoles={result.requiredRoles}
                />
                <PerChainEligibilityList
                  perChainRoleEligibility={perChainRoleEligibility}
                  isResolvingRoleEligibility={isResolvingRoleEligibility}
                  roleEligibilityError={roleEligibilityError}
                />
              </View>
            )}

            {error && !result && !countdown.isExpired && (
              <View className="mb-6">
                <ErrorState
                  message={
                    isOffline
                      ? "We couldn't complete the access check. Please check your connection and try again."
                      : "Please verify your inputs and try again."
                  }
                  onRetry={handleRetryAccessCheck}
                  isRetrying={isPending}
                />
                <PerChainEligibilityList
                  perChainRoleEligibility={perChainRoleEligibility}
                  isResolvingRoleEligibility={isResolvingRoleEligibility}
                  roleEligibilityError={roleEligibilityError}
                />
              </View>
            )}
          </BiometricGate>
        )}
      </ScrollView>
    </View>
  );
}

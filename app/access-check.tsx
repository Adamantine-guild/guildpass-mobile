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
  resolved:
    "bg-success/10 text-success border-success/30 dark:bg-green-900/30 dark:text-green-400 dark:border-green-600/50",
  "timed-out":
    "bg-amber-100 text-amber-700 border-amber-300 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-600/50",
  error:
    "bg-error/10 text-error border-error/30 dark:bg-red-900/30 dark:text-red-400 dark:border-red-600/50",
};

const firstParam = (value?: string | string[]) => (Array.isArray(value) ? value[0] : value);

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
    <Card className="mt-4 border-border dark:border-slate-700" testID="per-chain-eligibility-list">
      <View className="flex-row items-center justify-between mb-3">
        <Text className="text-text dark:text-slate-100 font-bold">Per-chain role eligibility</Text>
        {isResolvingRoleEligibility ? (
          <Text
            className="text-primary text-xs font-semibold"
            testID="per-chain-eligibility-loading"
          >
            Resolving
          </Text>
        ) : null}
      </View>

      {roleEligibilityError ? (
        <Text
          className="text-error dark:text-red-400 text-sm mb-3"
          testID="per-chain-eligibility-error"
        >
          {roleEligibilityError}
        </Text>
      ) : null}

      {perChainRoleEligibility.map((chain) => (
        <View
          key={`${chain.chainId}-${chain.status}`}
          className="border border-border dark:border-slate-700 rounded-xl p-3 mb-2"
          testID={`per-chain-eligibility-row-${chain.chainId}`}
        >
          <View className="flex-row items-center justify-between">
            <Text className="text-text dark:text-slate-100 font-semibold">
              Chain {chain.chainId}
            </Text>
            <Text
              className={`px-2 py-1 rounded-full border text-xs font-semibold ${statusClassName[chain.status]}`}
            >
              {statusCopy[chain.status]}
            </Text>
          </View>
          {chain.resolvedRoles && chain.resolvedRoles.length > 0 ? (
            <Text className="text-text-muted dark:text-slate-400 text-xs mt-2">
              Roles: {chain.resolvedRoles.join(", ")}
            </Text>
          ) : null}
          {chain.errorMessage ? (
            <Text className="text-error dark:text-red-400 text-xs mt-2">{chain.errorMessage}</Text>
          ) : null}
        </View>
      ))}
    </Card>
  );
}

export default function AccessCheck() {
  const router = useRouter();
  const {
    qrPayload,
    guildId: deepLinkGuildId,
    resourceId: deepLinkResourceId,
    walletAddress: deepLinkWalletAddress,
  } = useLocalSearchParams<{
    qrPayload?: string | string[];
    guildId?: string | string[];
    resourceId?: string | string[];
    walletAddress?: string | string[];
  }>();
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
  guilds.useGuildConfig(guildId);
  guilds.useRoles(guildId);
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

  useEffect(() => {
    if (
      qrPayload ||
      (deepLinkGuildId === undefined &&
        deepLinkResourceId === undefined &&
        deepLinkWalletAddress === undefined)
    ) {
      return;
    }

    const nextGuildId = firstParam(deepLinkGuildId)?.trim() ?? "";
    const nextResourceId = firstParam(deepLinkResourceId)?.trim() ?? "";
    const nextWalletAddress = firstParam(deepLinkWalletAddress)?.trim() ?? "";

    setGuildId(nextGuildId);
    setResourceId(nextResourceId);
    setAddress(nextWalletAddress || currentWallet || "");
    setScannedPayload(null);
    setWalletWarningDecision(null);
    setScanError(null);
    setAddressError(null);
    setGuildIdError(nextGuildId ? null : "Guild ID is required");
    setResourceIdError(nextResourceId ? null : "Resource ID is required");
    resetAccessCheck();
  }, [
    currentWallet,
    deepLinkGuildId,
    deepLinkResourceId,
    deepLinkWalletAddress,
    qrPayload,
    resetAccessCheck,
  ]);

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

  const handleCheck = () => {
    submitAccessCheck(address, guildId, resourceId);
  };

  const handleRetryAccessCheck = () => {
    submitAccessCheck(address, guildId, resourceId);
  };

  return (
    <View className="flex-1 bg-background dark:bg-slate-900" testID="access-check-screen">
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
            disabled={isOffline}
          />

          <View className="mt-4">
            <Text className="text-text-muted dark:text-slate-400 mb-2 font-medium">Guild ID</Text>
            <TextInput
              value={guildId}
              onChangeText={handleGuildIdChange}
              placeholder="e.g. alpha-guild"
              className={`bg-white dark:bg-slate-800 border ${guildIdError ? "border-error dark:border-red-500" : "border-border dark:border-slate-700"} rounded-xl p-4 text-text dark:text-slate-100 text-lg`}
              accessibilityLabel="Guild ID"
              accessibilityHint="Enter the guild identifier"
              testID="access-check-guild-id-input"
            />
            {guildIdError && (
              <Text className="text-error dark:text-red-400 text-sm mt-1">{guildIdError}</Text>
            )}
          </View>

          <View className="mt-4">
            <Text className="text-text-muted dark:text-slate-400 mb-2 font-medium">
              Resource ID
            </Text>
            <TextInput
              value={resourceId}
              onChangeText={handleResourceIdChange}
              placeholder="e.g. secret-channel"
              className={`bg-white dark:bg-slate-800 border ${resourceIdError ? "border-error dark:border-red-500" : "border-border dark:border-slate-700"} rounded-xl p-4 text-text dark:text-slate-100 text-lg`}
              accessibilityLabel="Resource ID"
              accessibilityHint="Enter the resource identifier"
              testID="access-check-resource-id-input"
            />
            {resourceIdError && (
              <Text className="text-error dark:text-red-400 text-sm mt-1">{resourceIdError}</Text>
            )}
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
              countdown.isExpired ||
              isOffline
            }
          />
          {isOffline ? (
            <Text className="text-amber-700 dark:text-amber-400 mt-3 text-center text-sm font-bold">
              QR Access Check Requires Internet
            </Text>
          ) : null}
        </Card>

        {scanError && (
          <Card className="mb-6 border-error bg-error/5 dark:border-red-600 dark:bg-red-900/30">
            <Text className="text-error dark:text-red-400 font-bold">QR code rejected</Text>
            <Text className="text-error/80 dark:text-red-300/80 text-sm mt-1">{scanError}</Text>
          </Card>
        )}

        {walletMismatchWarning && (
          <Card
            className="mb-6 border-primary/30 bg-primary/5 dark:border-primary/50 dark:bg-primary/20"
            accessibilityRole="alert"
            accessibilityLabel="Wallet address mismatch warning. This QR payload uses a different wallet address from your connected wallet."
          >
            <Text className="text-primary font-bold">Wallet address mismatch</Text>
            <Text className="text-text dark:text-slate-100 text-sm mt-2">
              {walletMismatchWarning}
            </Text>
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
                ? "border-error bg-error/5 dark:border-red-600 dark:bg-red-900/30"
                : countdown.isExpiringSoon
                  ? "border-amber-400 bg-amber-50 dark:border-amber-600 dark:bg-amber-900/30"
                  : "border-success/30 dark:border-green-600/50"
            }`}
          >
            <Text
              className={`font-bold mb-3 ${
                countdown.isExpired
                  ? "text-error dark:text-red-400"
                  : countdown.isExpiringSoon
                    ? "text-amber-700 dark:text-amber-400"
                    : "text-success dark:text-green-400"
              }`}
            >
              {countdown.isExpired ? "Scanned access expired" : "Scanned access details"}
            </Text>
            <View className="flex-row justify-between py-1">
              <Text className="text-text-muted dark:text-slate-400">Guild ID</Text>
              <Text className="text-text dark:text-slate-100 font-medium">
                {scannedPayload.guildId}
              </Text>
            </View>
            <View className="flex-row justify-between py-1">
              <Text className="text-text-muted dark:text-slate-400">Resource ID</Text>
              <Text className="text-text dark:text-slate-100 font-medium">
                {scannedPayload.resourceId}
              </Text>
            </View>
            {scannedPayload.expiresAt && (
              <View
                className="flex-row justify-between py-1"
                accessibilityLiveRegion={countdown.isExpired ? "assertive" : "none"}
                accessibilityRole={countdown.isExpired ? "alert" : undefined}
              >
                <Text className="text-text-muted dark:text-slate-400">Validity</Text>
                <Text
                  className={`font-medium ${
                    countdown.isExpired
                      ? "text-error dark:text-red-400"
                      : countdown.isExpiringSoon
                        ? "text-amber-700 dark:text-amber-400"
                        : "text-text dark:text-slate-100"
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
              <Card
                className="mb-12 border-2 border-error bg-error/5 dark:border-red-600 dark:bg-red-900/30"
                accessibilityRole="alert"
              >
                <View className="items-center">
                  <View className="w-16 h-16 rounded-full items-center justify-center mb-4 bg-error dark:bg-red-600">
                    <Text className="text-white text-3xl">!</Text>
                  </View>
                  <Text className="text-2xl font-bold text-error dark:text-red-400">Expired</Text>
                  <Text className="text-text-muted dark:text-slate-400 mt-2 text-center">
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
                  confidence={result.confidence}
                  syncStatus={result.syncStatus}
                  lastSyncedAt={result.lastSyncedAt}
                  credentialExpiresAt={result.credentialExpiresAt}
                  revocationSyncedAt={result.revocationSyncedAt}
                  discrepancy={result.discrepancy}
                />
                <PerChainEligibilityList
                  perChainRoleEligibility={perChainRoleEligibility}
                  isResolvingRoleEligibility={isResolvingRoleEligibility}
                  roleEligibilityError={roleEligibilityError}
                />
              </View>
            )}

            {error && !result && !countdown.isExpired && (
              <View className="mb-6" testID="access-check-error">
                <ErrorState
                  message={
                    isOffline
                      ? "We couldn't complete the access check. Please check your connection and try again."
                      : "Error checking access. Please verify your inputs and try again."
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

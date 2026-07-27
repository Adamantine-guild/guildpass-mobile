import { View, Text, ScrollView } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { useWallet } from "../../src/features/wallet/useWallet";
import { useGuilds, GuildNotFoundError } from "../../src/features/guilds/useGuilds";
import { useMembership } from "../../src/features/membership/useMembership";
import { AppHeader } from "../../src/components/AppHeader";
import { GuildDetailSkeleton } from "../../src/components/GuildDetailSkeleton";
import { ErrorState } from "../../src/components/ErrorState";
import { GuildNotFoundState } from "../../src/components/GuildNotFoundState";
import { Card } from "../../src/components/Card";
import { Button } from "../../src/components/Button";
import { RoleBadge } from "../../src/components/RoleBadge";
import { WalletAddress } from "../../src/components/WalletAddress";
import {
  RequirementCard,
  getChainDisplayName,
  isKnownChainId,
} from "../../src/components/RequirementCard";
import { StaleDataBanner } from "../../src/components/StaleDataBanner";
import { WalletRequired } from "../../src/components/WalletRequired";
import { useCombinedStaleState } from "../../src/features/offline/useStaleQuery";
import {
  groupRoleRequirementsByChain,
  normalizeRoleRequirements,
} from "../../src/features/guilds/roleRequirements";
import { useGuildChainAvailability } from "../../src/features/guilds/useGuildChainAvailability";
import type {
  AccessRequirement,
  PerChainRoleEligibilityResolution,
} from "../../src/features/access/roleEligibilityResolver";
import React from "react";

type GuildDetailRole = {
  id: string;
  name: string;
  chainId?: number;
  requirements?: AccessRequirement[];
};

function ChainUnavailableState({
  chainId,
  label,
  status,
  errorMessage,
  isRetrying,
  onRetry,
}: {
  chainId: number;
  label: string;
  status: PerChainRoleEligibilityResolution["status"];
  errorMessage?: string;
  isRetrying: boolean;
  onRetry: () => void;
}) {
  const isTimeout = status === "timed-out";

  return (
    <Card
      className="border-amber-300 bg-amber-50 dark:border-amber-600 dark:bg-amber-900/30"
      accessibilityRole="alert"
      accessibilityLabel={`${label} role requirements unavailable`}
      testID={`guild-chain-unavailable-${chainId}`}
    >
      <Text className="text-amber-800 dark:text-amber-300 font-bold">
        {isTimeout ? "Network check timed out" : "Network unavailable"}
      </Text>
      <Text className="text-text dark:text-slate-100 text-sm mt-2">
        {isTimeout
          ? `${label} did not respond before the timeout. Other networks can still be explored.`
          : `${label} is unavailable right now. Other networks can still be explored.`}
      </Text>
      {errorMessage ? (
        <Text className="text-amber-800 dark:text-amber-300 text-xs mt-2">{errorMessage}</Text>
      ) : null}
      <Button
        title="Retry"
        variant="outline"
        className="mt-3 py-2 px-4"
        loading={isRetrying}
        disabled={isRetrying}
        testID={`guild-chain-retry-${chainId}`}
        accessibilityLabel={`Retry ${label} role requirements`}
        onPress={onRetry}
      />
    </Card>
  );
}

export default function GuildDetail() {
  const { guildId } = useLocalSearchParams<{ guildId: string }>();
  const { walletAddress } = useWallet();
  const { useGuild, useGuildConfig, useRoles } = useGuilds();
  const { useMembershipQuery } = useMembership(walletAddress);
  const validGuildId = typeof guildId === "string" ? guildId : "";

  const guildQuery = useGuild(validGuildId);
  const guildConfigQuery = useGuildConfig(validGuildId);
  const membershipQuery = useMembershipQuery(validGuildId);
  const rolesQuery = useRoles(validGuildId);

  const { data: guild, isLoading: guildLoading, error: guildError } = guildQuery;
  const { isLoading: memLoading, data: membership } = membershipQuery;
  const { data: roles, isLoading: rolesLoading } = rolesQuery;
  const { data: guildConfig } = guildConfigQuery;

  const staleState = useCombinedStaleState([guildQuery, membershipQuery, rolesQuery]);
  const fallbackChainId = guild?.chainId ?? 1;
  const detailRoles = roles as GuildDetailRole[] | undefined;
  const normalizedRequirements = normalizeRoleRequirements(
    detailRoles,
    guildConfig?.requirements as
      | {
          id: string;
          name?: string;
          chainId: number;
        }[]
      | undefined,
    fallbackChainId,
  );
  const groupedRequirements = groupRoleRequirementsByChain(normalizedRequirements, fallbackChainId);
  const chainAvailability = useGuildChainAvailability({
    guildId: validGuildId,
    walletAddress,
    roles: detailRoles,
    enabled: !!validGuildId && !!walletAddress && !!detailRoles,
  });
  const availabilityByChain = React.useMemo(
    () =>
      new Map(
        chainAvailability.perChain.map((chain) => [chain.chainId, chain] as const),
      ),
    [chainAvailability.perChain],
  );
  const guildChainLabel =
    groupedRequirements.length === 0
      ? isKnownChainId(guild?.chainId ?? 1)
        ? `${getChainDisplayName(guild?.chainId ?? 1)} (${guild?.chainId ?? 1})`
        : `Unsupported network (chain: ${guild?.chainId ?? 1})`
      : groupedRequirements.length === 1
        ? groupedRequirements[0]?.label
        : `Multiple networks (${groupedRequirements.map((group) => group.label).join(", ")})`;

  const showSkeleton =
    (guildLoading && !guild) || (memLoading && !membership) || (rolesLoading && !roles);

  return (
    <WalletRequired>
      <View className="flex-1 bg-background dark:bg-slate-900" testID="guild-detail-screen">
        {!validGuildId ? (
          <ErrorState message="Invalid guild ID provided" />
        ) : showSkeleton ? (
          <GuildDetailSkeleton />
        ) : guildError instanceof GuildNotFoundError ? (
          <GuildNotFoundState />
        ) : guildError && !guild ? (
          <ErrorState
            message={
              staleState.isOffline
                ? "You are offline. Please reconnect to load guild details."
                : "Failed to load guild details"
            }
            onRetry={() => {
              void Promise.all([
                guildQuery.refetch(),
                membershipQuery.refetch(),
                rolesQuery.refetch(),
              ]);
            }}
            isRetrying={
              guildQuery.isFetching || membershipQuery.isFetching || rolesQuery.isFetching
            }
          />
        ) : !guild ? (
          <ErrorState
            message={
              staleState.isOffline
                ? "You are offline. Please reconnect to load guild details."
                : "Failed to load guild details"
            }
            onRetry={() => {
              void Promise.all([
                guildQuery.refetch(),
                membershipQuery.refetch(),
                rolesQuery.refetch(),
              ]);
            }}
            isRetrying={
              guildQuery.isFetching || membershipQuery.isFetching || rolesQuery.isFetching
            }
          />
        ) : (
          <>
            <AppHeader title={guild.name} showBack />
            <ScrollView className="flex-1 px-4 py-6">
              {staleState.isOffline ? (
                <StaleDataBanner reason="offline" lastSyncedAt={staleState.lastSyncedAt} />
              ) : staleState.isStale && staleState.reason ? (
                <StaleDataBanner
                  reason={staleState.reason}
                  lastSyncedAt={staleState.lastSyncedAt}
                />
              ) : null}

              <Card className="mb-6">
                <Text className="text-2xl font-bold text-text dark:text-slate-100 mb-2" testID="guild-name">
                  {guild.name}
                </Text>
                <Text className="text-text-muted dark:text-slate-400 mb-4" testID="guild-description">
                  {guild.description || "No description provided."}
                </Text>

                <View className="border-t border-border dark:border-slate-700 pt-4">
                  <View className="flex-row justify-between items-center mb-2">
                    <Text className="text-text-muted dark:text-slate-400">Owner</Text>
                    <WalletAddress address={guild.ownerAddress} testID="guild-owner" />
                  </View>
                  <View className="flex-row justify-between">
                    <Text className="text-text-muted dark:text-slate-400">Chain ID</Text>
                    <Text
                      className={`font-medium ${groupedRequirements.some((group) => isKnownChainId(group.chainId)) ? "text-text dark:text-slate-100" : "text-text-muted dark:text-slate-400 italic"}`}
                      testID="guild-chain-id"
                    >
                      {guildChainLabel}
                    </Text>
                  </View>
                </View>
              </Card>

              <View className="mb-6">
                <Text className="text-lg font-bold text-text dark:text-slate-100 mb-3">Your Membership</Text>
                <Card
                  className={membership?.isActive ? "border-success/30 dark:border-green-600/50" : ""}
                  accessibilityLabel={`Membership status: ${membership?.isActive ? "Active Member" : "Not a Member"}`}
                  testID="membership-status-card"
                >
                  <View className="flex-row justify-between items-center">
                    <Text className="text-text dark:text-slate-100 font-medium">Status</Text>
                    <Text
                      className={`font-bold ${membership?.isActive ? "text-success dark:text-green-400" : "text-text-muted dark:text-slate-400"}`}
                      testID="membership-status-text"
                    >
                      {membership?.isActive ? "Active Member" : "Not a Member"}
                    </Text>
                  </View>
                </Card>
              </View>

              <View className="mb-6">
                <Text className="text-lg font-bold text-text dark:text-slate-100 mb-3">Available Roles</Text>
                {groupedRequirements.length > 0 ? (
                  groupedRequirements.map((group) => (
                    <View key={`${group.chainId}`} className="mb-4">
                      <Text className="text-sm font-semibold text-text-muted dark:text-slate-400 mb-2">
                        {group.label}
                      </Text>
                      <View
                        className="flex-row flex-wrap"
                        testID={`guild-roles-list-${group.chainId}`}
                      >
                        {group.requirements.map((role) => (
                          <RequirementCard
                            key={role.id}
                            chainId={role.chainId}
                            testID={`role-requirement-${role.id}`}
                  groupedRequirements.map((group) => {
                    const availability = availabilityByChain.get(group.chainId);
                    const isUnavailable =
                      availability?.status === "timed-out" || availability?.status === "error";
                    const isChecking = chainAvailability.checkingChainIds.includes(group.chainId);

                    return (
                      <View key={`${group.chainId}`} className="mb-4">
                        <View className="flex-row justify-between items-center mb-2">
                          <Text className="text-sm font-semibold text-text-muted dark:text-slate-400">
                            {group.label}
                          </Text>
                          {isChecking ? (
                            <Text
                              className="text-xs font-semibold text-primary"
                              testID={`guild-chain-checking-${group.chainId}`}
                            >
                              Checking network
                            </Text>
                          ) : null}
                        </View>

                        {isUnavailable ? (
                          <ChainUnavailableState
                            chainId={group.chainId}
                            label={group.label}
                            status={availability.status}
                            errorMessage={availability.errorMessage}
                            isRetrying={isChecking}
                            onRetry={() => {
                              void chainAvailability.retryChain(group.chainId);
                            }}
                          />
                        ) : (
                          <View
                            className="flex-row flex-wrap"
                            testID={`guild-roles-list-${group.chainId}`}
                          >
                            {group.requirements.map((role) => (
                              <RequirementCard
                                key={role.id}
                                chainId={role.chainId}
                                testID={`role-requirement-${role.id}`}
                              >
                                <RoleBadge name={role.name} />
                              </RequirementCard>
                            ))}
                          </View>
                        )}
                      </View>
                    );
                  })
                ) : (
                  <Text className="text-text-muted dark:text-slate-400 italic">No roles defined for this guild.</Text>
                )}
              </View>
            </ScrollView>
          </>
        )}
      </View>
    </WalletRequired>
  );
}

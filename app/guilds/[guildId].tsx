import { View, Text, ScrollView } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { useWallet } from "../../src/features/wallet/useWallet";
import { useGuilds, GuildNotFoundError } from "../../src/features/guilds/useGuilds";
import { useMembership } from "../../src/features/membership/useMembership";
import { AppHeader } from "../../src/components/AppHeader";
import { LoadingState } from "../../src/components/LoadingState";
import { GuildDetailSkeleton } from "../../src/components/GuildDetailSkeleton";
import { ErrorState } from "../../src/components/ErrorState";
import { GuildNotFoundState } from "../../src/components/GuildNotFoundState";
import { Card } from "../../src/components/Card";
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
import { groupRoleRequirementsByChain } from "../../src/features/guilds/roleRequirements";
import React from "react";

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

  const {
    data: guild,
    isLoading: guildLoading,
    error: guildError,
    isPending: guildPending,
  } = guildQuery;
  const { isLoading: memLoading, isPending: memPending, data: membership } = membershipQuery;
  const { data: roles, isLoading: rolesLoading, isPending: rolesPending } = rolesQuery;
  const { data: guildConfig } = guildConfigQuery;

  const staleState = useCombinedStaleState([guildQuery, membershipQuery, rolesQuery]);
  const groupedRequirements = groupRoleRequirementsByChain(
    (roles as Array<{ id: string; name: string; chainId?: number }> | undefined) &&
      guildConfig?.requirements
      ? (roles as Array<{ id: string; name: string; chainId?: number }> | undefined)?.map(
          (role) => {
            const requirement = guildConfig.requirements?.find(
              (item: { id: string; name?: string; chainId: number }) =>
                item.id === role.id || item.name === role.name,
            );
            return {
              id: role.id,
              name: role.name,
              chainId: role.chainId ?? requirement?.chainId ?? guild?.chainId ?? 1,
            };
          },
        )
      : ((roles as Array<{ id: string; name: string; chainId?: number }> | undefined) ?? []).map(
          (role) => ({
            id: role.id,
            name: role.name,
            chainId: role.chainId ?? guild?.chainId ?? 1,
          }),
        ),
    guild?.chainId ?? 1,
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
                    <AddressChip address={guild.ownerAddress} testID="guild-owner" />
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
                          >
                            <RoleBadge name={role.name} />
                          </RequirementCard>
                        ))}
                      </View>
                    </View>
                  ))
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

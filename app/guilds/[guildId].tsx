import { View, Text, ScrollView, TouchableOpacity } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { useWallet } from "../../src/features/wallet/useWallet";
import { useGuilds } from "../../src/features/guilds/useGuilds";
import { useMembership } from "../../src/features/membership/useMembership";
import { useAuthenticatedSession } from "../../src/features/session/useAuthenticatedSession";
import { AppHeader } from "../../src/components/AppHeader";
import { LoadingState } from "../../src/components/LoadingState";
import { ErrorState } from "../../src/components/ErrorState";
import { Card } from "../../src/components/Card";
import { Button } from "../../src/components/Button";
import { RoleBadge } from "../../src/components/RoleBadge";
import { StaleDataBanner } from "../../src/components/StaleDataBanner";
import { WalletRequired } from "../../src/components/WalletRequired";
import { useCombinedStaleState } from "../../src/features/offline/useStaleQuery";
import React from "react";

export default function GuildDetail() {
  const { guildId } = useLocalSearchParams<{ guildId: string }>();
  const { walletAddress } = useWallet();
  const { useGuild, useRoles } = useGuilds();
  // Membership/roles are bound to the authenticated session address, never a raw
  // param (see useMembership.assertSessionAddress).
  const { useMembershipQuery } = useMembership(null);
  const { reAuthRequired, reauthenticate } = useAuthenticatedSession();
  const validGuildId = typeof guildId === "string" ? guildId : "";

  const guildQuery = useGuild(validGuildId);
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

  const staleState = useCombinedStaleState([guildQuery, membershipQuery, rolesQuery]);

  return (
    <WalletRequired>
      <View className="flex-1 bg-background" testID="guild-detail-screen">
        {reAuthRequired ? (
          <Card className="mb-6 border-warning/40">
            <Text className="text-base font-bold text-text mb-1">Session expired</Text>
            <Text className="text-text-muted mb-4">
              Your session needs to be renewed. Sign in again to continue viewing your membership.
            </Text>
            <Button
              title="Sign in again"
              onPress={() => walletAddress && reauthenticate(walletAddress)}
              testID="reauth-button"
            />
          </Card>
        ) : null}
        {!validGuildId ? (
          <ErrorState message="Invalid guild ID provided" />
        ) : (guildPending && guildLoading) || (memPending && memLoading) || (rolesPending && rolesLoading) ? (
          <LoadingState message="Fetching guild details..." />
        ) : guildError && !guild ? (
          <ErrorState
            message={
              staleState.isOffline
                ? "You are offline. Please reconnect to load guild details."
                : "Failed to load guild details"
            }
          />
        ) : !guild ? (
          <ErrorState
            message={
              staleState.isOffline
                ? "You are offline. Please reconnect to load guild details."
                : "Failed to load guild details"
            }
          />
        ) : (
          <>
            <AppHeader title={guild.name} showBack />
            <ScrollView className="flex-1 px-4 py-6">
              {staleState.isOffline ? (
                <StaleDataBanner reason="offline" lastSyncedAt={staleState.lastSyncedAt} />
              ) : staleState.isStale && staleState.reason ? (
                <StaleDataBanner reason={staleState.reason} lastSyncedAt={staleState.lastSyncedAt} />
              ) : null}

              <Card className="mb-6">
                <Text className="text-2xl font-bold text-text mb-2" testID="guild-name">
                  {guild.name}
                </Text>
                <Text className="text-text-muted mb-4" testID="guild-description">
                  {guild.description || "No description provided."}
                </Text>

                <View className="border-t border-border pt-4">
                  <View className="flex-row justify-between mb-2">
                    <Text className="text-text-muted">Owner</Text>
                    <Text className="text-text font-medium" numberOfLines={1} testID="guild-owner">
                      {guild.ownerAddress.substring(0, 6)}...{guild.ownerAddress.substring(38)}
                    </Text>
                  </View>
                  <View className="flex-row justify-between">
                    <Text className="text-text-muted">Chain ID</Text>
                    <Text className="text-text font-medium" testID="guild-chain-id">
                      {guild.chainId}
                    </Text>
                  </View>
                </View>
              </Card>

              <View className="mb-6">
                <Text className="text-lg font-bold text-text mb-3">Your Membership</Text>
                <Card
                  className={membership?.isActive ? "border-success/30" : ""}
                  accessibilityLabel={`Membership status: ${membership?.isActive ? "Active Member" : "Not a Member"}`}
                  testID="membership-status-card"
                >
                  <View className="flex-row justify-between items-center">
                    <Text className="text-text font-medium">Status</Text>
                    <Text
                      className={`font-bold ${membership?.isActive ? "text-success" : "text-text-muted"}`}
                      testID="membership-status-text"
                    >
                      {membership?.isActive ? "Active Member" : "Not a Member"}
                    </Text>
                  </View>
                </Card>
              </View>

              <View className="mb-6">
                <Text className="text-lg font-bold text-text mb-3">Available Roles</Text>
                <View className="flex-row flex-wrap" testID="guild-roles-list">
                  {roles && roles.length > 0 ? (
                    roles.map((role: { id: string; name: string }) => <RoleBadge key={role.id} name={role.name} />)
                  ) : (
                    <Text className="text-text-muted italic">No roles defined for this guild.</Text>
                  )}
                </View>
              </View>
            </ScrollView>
          </>
        )}
      </View>
    </WalletRequired>
  );
}

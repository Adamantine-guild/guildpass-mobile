import { View, FlatList } from "react-native";
import { useRouter } from "expo-router";
import { useWallet } from "../src/features/wallet/useWallet";
import { useMembership } from "../src/features/membership/useMembership";
import { AppHeader } from "../src/components/AppHeader";
import { GuildCard } from "../src/components/GuildCard";
import { LoadingState } from "../src/components/LoadingState";
import { ErrorState } from "../src/components/ErrorState";
import { EmptyState } from "../src/components/EmptyState";
import React from "react";

export default function Guilds() {
  const router = useRouter();
  const { walletAddress } = useWallet();
  const { getMembership } = useMembership(walletAddress);

  // In a real app, you would fetch all guilds.
  // For MVP, we'll show a few example guilds that the user can explore.
  const exampleGuilds = [
    { id: "guild_abc", name: "Alpha Guild", isActive: true, roleCount: 3 },
    { id: "guild_xyz", name: "Beta Community", isActive: true, roleCount: 5 },
    { id: "guild_123", name: "Gamma DAO", isActive: false, roleCount: 2 },
  ];

  return (
    <View className="flex-1 bg-background">
      <AppHeader title="My Guilds" showBack />
      <FlatList
        data={exampleGuilds}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ padding: 16 }}
        renderItem={({ item }) => (
          <GuildCard
            name={item.name}
            id={item.id}
            isActive={item.isActive}
            roleCount={item.roleCount}
            onPress={() => router.push(`/guilds/${item.id}`)}
          />
        )}
        ListEmptyComponent={
          <EmptyState
            title="No Guilds Found"
            message="You are not a member of any guilds yet."
            actionTitle="Explore Guilds"
            onAction={() => {}}
          />
        }
      />
    </View>
  );
}

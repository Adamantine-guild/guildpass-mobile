import { View, Text } from "react-native";
import React from "react";
import { Button } from "./Button";

type EmptyMembershipsStateProps = {
  onConnectDifferentWallet: () => void;
};

export const EmptyMembershipsState = ({
  onConnectDifferentWallet,
}: EmptyMembershipsStateProps) => {
  return (
    <View
      className="flex-1 justify-center items-center p-6 bg-background"
      accessibilityRole="summary"
      testID="empty-memberships-state"
    >
      <View className="w-24 h-24 bg-primary/10 rounded-full items-center justify-center mb-6">
        <Text className="text-5xl" accessibilityLabel="No guilds illustration">
          🛡️
        </Text>
      </View>
      <Text className="text-text text-2xl font-bold text-center mb-2">
        No Memberships Found
      </Text>
      <Text className="text-text-muted text-center mb-8 px-4">
        This wallet isn't a member of any guilds yet. Connect a different wallet to view your memberships and roles.
      </Text>
      <Button
        title="Connect a different wallet"
        onPress={onConnectDifferentWallet}
        variant="outline"
        testID="connect-different-wallet-button"
        accessibilityLabel="Connect a different wallet"
        accessibilityHint="Disconnects the current wallet and routes to the connect screen"
      />
    </View>
  );
};

import { View, Text } from "react-native";
import { useRouter } from "expo-router";
import React from "react";
import { Button } from "./Button";

export const GuildNotFoundState = () => {
  const router = useRouter();

  return (
    <View className="flex-1 justify-center items-center p-6 bg-background" testID="guild-not-found-state">
      <Text className="text-4xl mb-4">🔍</Text>
      <Text className="text-2xl font-bold text-text mb-3 text-center">Guild Not Found</Text>
      <Text className="text-text-muted text-center mb-6 px-4">
        The guild you're looking for doesn't exist or may have been removed.
      </Text>
      <Button
        title="Browse Guilds"
        onPress={() => router.replace("/guilds")}
        variant="outline"
        className="w-full"
        testID="browse-guilds-button"
      />
    </View>
  );
};

import { Stack } from "expo-router";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "../src/lib/queryClient";
import { View } from "react-native";

export default function RootLayout() {
  return (
    <QueryClientProvider client={queryClient}>
      <View className="flex-1 bg-background">
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: "#f8fafc" },
          }}
        >
          <Stack.Screen name="index" />
          <Stack.Screen name="onboarding" />
          <Stack.Screen name="profile" />
          <Stack.Screen name="guilds" />
          <Stack.Screen name="guilds/[guildId]" />
          <Stack.Screen name="access-check" />
          <Stack.Screen name="settings" />
        </Stack>
      </View>
    </QueryClientProvider>
  );
}

// GuildPass Mobile: Import package module dependencies.
import { Stack } from "expo-router";
// GuildPass Mobile: Pull in react-native, expo, or external state libraries.
import { QueryClientProvider } from "@tanstack/react-query";
// GuildPass Mobile: Import package module dependencies.
import { queryClient } from "../src/lib/queryClient";
// GuildPass Mobile: Pull in react-native, expo, or external state libraries.
import { View } from "react-native";

// GuildPass Mobile: Core mobile screen or hook export definition.
export default function RootLayout() {
  // GuildPass Mobile: Return evaluated JSX layout or callback response.
  return (
    <QueryClientProvider client={queryClient}>
      <View className="flex-1 bg-background">
        <Stack
          // GuildPass Mobile: Enter functional execution container scope block.
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: "#f8fafc" },
            // GuildPass Mobile: Exit functional execution container scope block.
          }}
        >
          <Stack.Screen name="index" />
          <Stack.Screen name="onboarding" />
          <Stack.Screen name="profile" />
          <Stack.Screen name="guilds" />
          <Stack.Screen name="guilds/[guildId]" />
          <Stack.Screen name="access-check" />
          <Stack.Screen name="access-scanner" />
          <Stack.Screen name="settings" />
        </Stack>
      </View>
    </QueryClientProvider>
  );
  // GuildPass Mobile: Exit functional execution container scope block.
}

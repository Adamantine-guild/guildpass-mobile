import { Stack } from "expo-router";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { View } from "react-native";
import { useEffect } from "react";
import { queryClient } from "../src/lib/queryClient";
import { asyncStoragePersister } from "../src/lib/queryPersister";
import { isPersistableQuery, QUERY_GC_TIME_MS } from "../src/lib/offlineCache";
import "../src/lib/networkManager";
import { useWalletStore } from "../src/features/wallet/wallet.store";
import { useSessionStore } from "../src/features/session/session.store";
import { configureNotifications } from "../src/features/notifications/useNotifications";

export default function RootLayout() {
  // Configure notification handler and channels once
  useEffect(() => {
    configureNotifications();
  }, []);

  // Restore session state from wallet store on cold start
  useEffect(() => {
    const { walletAddress } = useWalletStore.getState();
    if (walletAddress) {
      useSessionStore.getState().restoreSession({ walletAddress });
    }
  }, []);

  return (
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{
        persister: asyncStoragePersister,
        maxAge: QUERY_GC_TIME_MS,
        dehydrateOptions: {
          shouldDehydrateQuery: (query) =>
            query.state.status === "success" && isPersistableQuery(query.queryKey),
        },
      }}
    >
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
          <Stack.Screen name="access-scanner" />
          <Stack.Screen name="settings" />
          <Stack.Screen name="deep-link-error" />
        </Stack>
      </View>
    </PersistQueryClientProvider>
  );
}

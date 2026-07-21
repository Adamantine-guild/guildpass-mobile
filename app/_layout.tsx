import { Stack } from "expo-router";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { View } from "react-native";
import { queryClient } from "../src/lib/queryClient";
import { asyncStoragePersister } from "../src/lib/queryPersister";
import { isPersistableQuery, QUERY_GC_TIME_MS } from "../src/lib/offlineCache";
import { initConnectivityService } from "../src/features/network/connectivityService";
import { initSyncManager, triggerSync } from "../src/features/sync/syncManager";
import { ErrorBoundary } from "../src/components/ErrorBoundary";
import { SyncCorrectionOverlay } from "../src/components/SyncCorrectionOverlay";
import { IntegrityWarningBanner } from "../src/components/IntegrityWarningBanner";
import { WalletConnectProvider } from "../src/features/wallet/WalletConnectProvider";
import { useSecurityInit } from "../src/features/security";
import { initFocusManager } from "../src/lib/focusManager";
import { SensitiveStorageMigrationGate } from "../src/features/security/SensitiveStorageMigrationGate";

initConnectivityService();
initSyncManager();
initFocusManager(queryClient);

function SecurityInit() {
  useSecurityInit();
  return null;
}

export default function RootLayout() {
  return (
    <ErrorBoundary>
      <SensitiveStorageMigrationGate>
        <SecurityInit />
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
          onSuccess={() => {
            // The persisted cache is only fully restored now; reconcile it so a
            // device that reopens online (after being offline) still corrects
            // stale grants instead of waiting for the next reconnect event.
            void triggerSync();
          }}
        >
          <View className="flex-1 bg-background">
            <WalletConnectProvider>
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
              <SyncCorrectionOverlay />
              <IntegrityWarningBanner />
            </WalletConnectProvider>
          </View>
        </PersistQueryClientProvider>
      </SensitiveStorageMigrationGate>
    </ErrorBoundary>
  );
}

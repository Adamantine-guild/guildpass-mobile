import { Stack } from "expo-router";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { View, useColorScheme } from "react-native";
import { queryClient } from "../src/lib/queryClient";
import { asyncStoragePersister } from "../src/lib/queryPersister";
import { isPersistableQuery, QUERY_GC_TIME_MS } from "../src/lib/offlineCache";
import { initConnectivityService } from "../src/features/network/connectivityService";
import { initSyncManager, triggerSync } from "../src/features/sync/syncManager";
import { mutationReplayer } from "../src/lib/mutationReplayer";
import { ErrorBoundary } from "../src/components/ErrorBoundary";
import { ScreenErrorBoundary } from "../src/components/ScreenErrorBoundary";
import { SyncCorrectionOverlay } from "../src/components/SyncCorrectionOverlay";
import { SyncStatusBanner } from "../src/components/SyncStatusBanner";
import { OfflineBanner } from "../src/components/OfflineBanner";
import { IntegrityWarningBanner } from "../src/components/IntegrityWarningBanner";
import { WalletConnectProvider } from "../src/features/wallet/WalletConnectProvider";
import { useSecurityInit } from "../src/features/security";
import { initFocusManager } from "../src/lib/focusManager";
import { registerBuiltInIssuers } from "../src/lib/credentials/registerBuiltInIssuers";
import { EmbeddedWalletProvider } from "../src/features/wallet/EmbeddedWalletProvider";
import { DeepLinkHandler } from "../src/features/deep-links/DeepLinkHandler";

import "react-native-get-random-values";
import "fast-text-encoding";
import "@ethersproject/shims";
import { SensitiveStorageMigrationGate } from "../src/features/security/SensitiveStorageMigrationGate";

initConnectivityService();
initSyncManager();
mutationReplayer.start();
initFocusManager(queryClient);
// Discovery only — verification paths hold direct references to their own
// registries and work whether or not this has run.
registerBuiltInIssuers();

function SecurityInit() {
  useSecurityInit();
  return null;
}

export default function RootLayout() {
  const colorScheme = useColorScheme();

  return (
    <ErrorBoundary context="app-root">
      <SensitiveStorageMigrationGate>
        <SecurityInit />
        <EmbeddedWalletProvider>
          <PersistQueryClientProvider
            client={queryClient}
            persistOptions={{
              persister: asyncStoragePersister,
              maxAge: QUERY_GC_TIME_MS,
              dehydrateOptions: {
                shouldDehydrateQuery: (query) =>
                  query.state.status === "success" && isPersistableQuery(query.queryKey),
                shouldDehydrateMutation: (mutation) => mutation.meta?.isQueueable === true,
              },
            }}
            onSuccess={() => {
              // The persisted cache is only fully restored now; reconcile it so a
              // device that reopens online (after being offline) still corrects
              // stale grants instead of waiting for the next reconnect event.
              void triggerSync();
            }}
          >
            <View className="flex-1 bg-background dark:bg-slate-900">
              <WalletConnectProvider>
                <Stack
                  screenOptions={{
                    headerShown: false,
                    contentStyle: { backgroundColor: colorScheme === 'dark' ? '#0f172a' : '#f8fafc' },
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
                <DeepLinkHandler />
                <ScreenErrorBoundary screenName="app-stack">
                  <Stack
                    screenOptions={{
                      headerShown: false,
                      contentStyle: {
                        backgroundColor: colorScheme === "dark" ? "#0f172a" : "#f8fafc",
                      },
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
                    <Stack.Screen name="push-notification-setup" />
                    <Stack.Screen name="pending-changes" options={{ presentation: "modal" }} />
                    <Stack.Screen name="deep-link-error" />
                  </Stack>
                </ScreenErrorBoundary>
                <SyncCorrectionOverlay />
                <SyncStatusBanner />
                <OfflineBanner />
                <IntegrityWarningBanner />
              </WalletConnectProvider>
            </View>
          </PersistQueryClientProvider>
        </EmbeddedWalletProvider>
      </SensitiveStorageMigrationGate>
    </ErrorBoundary>
  );
}

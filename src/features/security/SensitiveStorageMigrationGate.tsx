import React, { useCallback, useEffect, useState, type ReactNode } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import {
  migrateLegacySensitiveStorage,
  type SensitiveStorageMigrationReport,
} from "../../lib/storage";

type MigrationStatus = "migrating" | "failed" | "ready";

type SensitiveStorageMigrationGateProps = {
  children: ReactNode;
  migrate?: () => Promise<SensitiveStorageMigrationReport>;
};

export function SensitiveStorageMigrationGate({
  children,
  migrate = migrateLegacySensitiveStorage,
}: SensitiveStorageMigrationGateProps) {
  const [status, setStatus] = useState<MigrationStatus>("migrating");
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let isMounted = true;
    void migrate()
      .then((report) => {
        if (!isMounted) return;
        if (report.failedKeys.length > 0) {
          console.error("Sensitive storage migration completed with failures", report.failedKeys);
          setStatus("failed");
          return;
        }
        setStatus("ready");
      })
      .catch((error) => {
        if (!isMounted) return;
        console.error("Sensitive storage migration failed", error);
        setStatus("failed");
      });
    return () => {
      isMounted = false;
    };
  }, [attempt, migrate]);

  const retry = useCallback(() => {
    setStatus("migrating");
    setAttempt((current) => current + 1);
  }, []);

  if (status === "ready") return <>{children}</>;

  if (status === "failed") {
    return (
      <View
        className="flex-1 items-center justify-center bg-background px-6"
        testID="sensitive-storage-migration-error"
      >
        <Text className="mb-2 text-center text-lg font-semibold text-text">
          Secure storage needs attention
        </Text>
        <Text className="mb-6 text-center text-sm text-text-muted">
          GuildPass could not finish protecting data saved by an earlier version. Retry before
          continuing.
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Retry secure storage migration"
          className="rounded-lg bg-primary px-5 py-3"
          onPress={retry}
          testID="sensitive-storage-migration-retry"
        >
          <Text className="font-semibold text-white">Retry</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View
      accessibilityLabel="Securing local data"
      className="flex-1 items-center justify-center bg-background"
      testID="sensitive-storage-migration-loading"
    >
      <ActivityIndicator />
      <Text className="mt-3 text-sm text-text-muted">Securing local data…</Text>
    </View>
  );
}

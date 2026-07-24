import React from "react";
import { View } from "react-native";
import { Card } from "./Card";
import { Skeleton } from "./Skeleton";

/** Placeholder mirroring AccessStatusCard's layout while a scanned QR
 * payload is being checked against the guild's role requirements. */
export function AccessStatusCardSkeleton() {
  return (
    <Card
      testID="access-status-skeleton"
      accessibilityRole="progressbar"
      accessibilityLabel="Checking protocol permissions"
      accessibilityLiveRegion="polite"
    >
      <View className="items-center mb-6">
        <Skeleton className="w-16 h-16 rounded-full mb-4" />
        <Skeleton className="h-7 w-40 rounded mb-2" />
        <Skeleton className="h-4 w-56 rounded" />
      </View>

      <View className="border-t border-border pt-4">
        <Skeleton className="h-4 w-28 rounded mb-3" />
        <View className="flex-row flex-wrap">
          <Skeleton className="h-8 w-24 rounded-full mr-2 mb-2" />
          <Skeleton className="h-8 w-20 rounded-full mr-2 mb-2" />
        </View>
      </View>
    </Card>
  );
}

import React from "react";
import { View } from "react-native";
import { Card } from "./Card";
import { Skeleton } from "./Skeleton";

/** Single placeholder mirroring GuildCard's layout: title + status pill,
 * an ID line, and a role-badge row. */
export function GuildCardSkeleton() {
  return (
    <Card className="mb-4">
      <View className="flex-row justify-between items-center mb-2">
        <Skeleton className="h-6 w-40 rounded" />
        <Skeleton className="h-6 w-20 rounded-full" />
      </View>
      <Skeleton className="h-4 w-32 rounded mb-4" />
      <View className="flex-row items-center">
        <Skeleton className="h-6 w-20 rounded-full mr-2" />
        <Skeleton className="h-4 w-28 rounded" />
      </View>
    </Card>
  );
}

/** List-shaped placeholder for the guilds screen while memberships load.
 * `count` mirrors a typical first page so the transition to real data
 * doesn't visibly reflow the list. */
export function GuildListSkeleton({ count = 5 }: { count?: number }) {
  return (
    <View
      className="px-4 pt-4"
      testID="guild-list-skeleton"
      accessibilityRole="progressbar"
      accessibilityLabel="Loading memberships"
      accessibilityLiveRegion="polite"
    >
      {Array.from({ length: count }).map((_, index) => (
        <GuildCardSkeleton key={index} />
      ))}
    </View>
  );
}

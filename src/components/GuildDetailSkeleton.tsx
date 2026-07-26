import React from "react";
import { View, ScrollView, SafeAreaView } from "react-native";
import { Skeleton } from "./Skeleton";
import { Card } from "./Card";

export function GuildDetailSkeleton() {
  return (
    <View
      className="flex-1 bg-background"
      testID="guild-detail-skeleton"
      accessibilityRole="progressbar"
      accessibilityLabel="Loading guild details"
      accessibilityLiveRegion="polite"
    >
      {/* Skeleton header matching AppHeader */}
      <SafeAreaView className="bg-white border-b border-border">
        <View className="flex-row items-center px-4 py-3">
          <Skeleton className="w-8 h-8 rounded-full mr-4" />
          <Skeleton className="h-6 w-48 rounded" />
        </View>
      </SafeAreaView>

      <ScrollView className="flex-1 px-4 py-6">
        {/* Main Guild Details Card Skeleton */}
        <Card className="mb-6">
          {/* Guild Title */}
          <Skeleton className="h-8 w-64 rounded-lg mb-3" />
          {/* Guild Description (multi-line) */}
          <Skeleton className="h-4 w-full rounded mb-2" />
          <Skeleton className="h-4 w-5/6 rounded mb-4" />

          {/* Border line */}
          <View className="border-t border-border pt-4">
            {/* Owner Row */}
            <View className="flex-row justify-between mb-2">
              <Skeleton className="h-4 w-16 rounded" />
              <Skeleton className="h-4 w-28 rounded" />
            </View>
            {/* Chain ID Row */}
            <View className="flex-row justify-between">
              <Skeleton className="h-4 w-20 rounded" />
              <Skeleton className="h-4 w-36 rounded" />
            </View>
          </View>
        </Card>

        {/* Membership status card skeleton */}
        <View className="mb-6">
          <Skeleton className="h-5 w-36 rounded-md mb-3" />
          <Card>
            <View className="flex-row justify-between items-center">
              <Skeleton className="h-4 w-16 rounded" />
              <Skeleton className="h-4 w-24 rounded" />
            </View>
          </Card>
        </View>

        {/* Available Roles badges skeleton */}
        <View className="mb-6">
          <Skeleton className="h-5 w-32 rounded-md mb-3" />
          <View className="flex-row flex-wrap">
            <Skeleton className="h-10 w-24 rounded-lg mr-2 mb-2" />
            <Skeleton className="h-10 w-28 rounded-lg mr-2 mb-2" />
            <Skeleton className="h-10 w-20 rounded-lg mr-2 mb-2" />
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

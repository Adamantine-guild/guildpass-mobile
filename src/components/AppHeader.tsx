import { View, Text, TouchableOpacity, SafeAreaView } from "react-native";
import React from "react";
import { useRouter } from "expo-router";
import { useMutationQueue } from "../features/offline/mutationQueue";

type AppHeaderProps = {
  title: string;
  showBack?: boolean;
};

export const AppHeader = ({ title, showBack = false }: AppHeaderProps) => {
  const router = useRouter();
  const queuedMutations = useMutationQueue();

  return (
    <SafeAreaView className="bg-white dark:bg-slate-900 border-b border-border dark:border-slate-700">
      <View className="flex-row items-center px-4 py-3">
        {showBack && (
          <TouchableOpacity
            onPress={() => router.back()}
            className="mr-4 p-2"
            accessibilityRole="button"
            accessibilityLabel={`Go back from ${title}`}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Text className="text-primary dark:text-indigo-400 text-2xl font-bold" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">←</Text>
          </TouchableOpacity>
        )}
        <Text
          className="text-xl font-bold text-text dark:text-slate-100 flex-1"
          accessibilityRole="header"
        >
          {title}
        </Text>

        {queuedMutations.length > 0 && (
          <TouchableOpacity
            onPress={() => router.push("/pending-changes")}
            className="p-2 relative"
            accessibilityRole="button"
            accessibilityLabel={`${queuedMutations.length} pending ${queuedMutations.length === 1 ? "change" : "changes"}, tap to review`}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Text className="text-2xl" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">☁️</Text>
            <View
              className="absolute top-1 right-1 bg-red-500 rounded-full w-4 h-4 items-center justify-center"
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
            >
              <Text className="text-white text-xs font-bold">{queuedMutations.length}</Text>
            </View>
          </TouchableOpacity>
        )}
      </View>
    </SafeAreaView>
  );
};

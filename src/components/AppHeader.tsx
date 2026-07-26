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
    <SafeAreaView className="bg-white border-b border-border">
      <View className="flex-row items-center px-4 py-3">
        {showBack && (
          <TouchableOpacity
            onPress={() => router.back()}
            className="mr-4 p-2"
            accessibilityRole="button"
            accessibilityLabel="Go back"
          >
            <Text className="text-primary text-2xl font-bold">←</Text>
          </TouchableOpacity>
        )}
        <Text className="text-xl font-bold text-text flex-1">{title}</Text>
        
        {queuedMutations.length > 0 && (
          <TouchableOpacity
            onPress={() => router.push("/pending-changes")}
            className="p-2 relative"
            accessibilityRole="button"
            accessibilityLabel="Pending changes"
          >
            <Text className="text-2xl">☁️</Text>
            <View className="absolute top-1 right-1 bg-red-500 rounded-full w-4 h-4 items-center justify-center">
              <Text className="text-white text-xs font-bold">{queuedMutations.length}</Text>
            </View>
          </TouchableOpacity>
        )}
      </View>
    </SafeAreaView>
  );
};

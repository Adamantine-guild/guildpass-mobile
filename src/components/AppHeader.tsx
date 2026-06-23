import { View, Text, TouchableOpacity, SafeAreaView } from "react-native";
import React from "react";
import { useRouter, usePathname } from "expo-router";

type AppHeaderProps = {
  title: string;
  showBack?: boolean;
};

export const AppHeader = ({ title, showBack = false }: AppHeaderProps) => {
  const router = useRouter();

  return (
    <SafeAreaView className="bg-white border-b border-border">
      <View className="flex-row items-center px-4 py-3">
        {showBack && (
          <TouchableOpacity onPress={() => router.back()} className="mr-4 p-2">
            <Text className="text-primary text-2xl font-bold">←</Text>
          </TouchableOpacity>
        )}
        <Text className="text-xl font-bold text-text flex-1">{title}</Text>
      </View>
    </SafeAreaView>
  );
};

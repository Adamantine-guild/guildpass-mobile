import { View, Text, ActivityIndicator } from "react-native";
import React from "react";

export const LoadingState = ({ message = "Loading..." }: { message?: string }) => {
  return (
    <View className="flex-1 justify-center items-center p-6 bg-background">
      <ActivityIndicator size="large" color="#6366f1" />
      <Text className="mt-4 text-text-muted text-lg">{message}</Text>
    </View>
  );
};

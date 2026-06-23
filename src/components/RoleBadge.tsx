import { View, Text } from "react-native";
import React from "react";

export const RoleBadge = ({ name }: { name: string }) => {
  return (
    <View className="bg-primary/10 px-3 py-1.5 rounded-lg mr-2 mb-2">
      <Text className="text-primary font-medium text-sm">{name}</Text>
    </View>
  );
};

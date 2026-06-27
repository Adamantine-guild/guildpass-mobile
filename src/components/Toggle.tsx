import { View, Text, Switch, TouchableOpacity } from "react-native";
import React from "react";

type ToggleProps = {
  label: string;
  value: boolean;
  onValueChange: (value: boolean) => void;
  testID?: string;
};

export const Toggle = ({ label, value, onValueChange, testID }: ToggleProps) => {
  return (
    <View className="flex-row justify-between items-center py-3 border-b border-border">
      <Text className="text-text font-medium">{label}</Text>
      <Switch
        value={value}
        onValueChange={onValueChange}
        trackColor={{ false: "#e2e8f0", true: "#6366f1" }}
        thumbColor={value ? "#ffffff" : "#f4f4f5"}
        testID={testID}
      />
    </View>
  );
};

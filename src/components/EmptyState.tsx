import { View, Text } from "react-native";
import React from "react";
import { Button } from "./Button";

type EmptyStateProps = {
  title: string;
  message: string;
  actionTitle?: string;
  onAction?: () => void;
};

export const EmptyState = ({ title, message, actionTitle, onAction }: EmptyStateProps) => {
  return (
    <View className="flex-1 justify-center items-center p-6 bg-background">
      <View className="w-20 h-20 bg-text-muted/10 rounded-full items-center justify-center mb-6">
        <Text className="text-4xl">∅</Text>
      </View>
      <Text className="text-text text-2xl font-bold text-center mb-2">{title}</Text>
      <Text className="text-text-muted text-center mb-8">{message}</Text>
      {actionTitle && onAction && (
        <Button title={actionTitle} onPress={onAction} variant="outline" />
      )}
    </View>
  );
};

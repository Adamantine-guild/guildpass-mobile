import { View, Text } from "react-native";
import React from "react";
import { Button } from "./Button";

type ErrorStateProps = {
  message: string;
  onRetry?: () => void;
  isRetrying?: boolean;
};

export const ErrorState = ({ message, onRetry, isRetrying = false }: ErrorStateProps) => {
  return (
    <View className="flex-1 justify-center items-center p-6 bg-background">
      <Text className="text-error text-xl font-bold text-center mb-2">Something went wrong</Text>
      <Text className="text-text-muted text-center mb-6">{message}</Text>
      {onRetry && (
        <Button
          title="Try Again"
          onPress={onRetry}
          variant="outline"
          loading={isRetrying}
          disabled={isRetrying}
        />
      )}
    </View>
  );
};

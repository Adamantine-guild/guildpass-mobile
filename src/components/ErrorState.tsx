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
    <View
      className="flex-1 justify-center items-center p-6 bg-background dark:bg-slate-900"
      accessibilityRole="alert"
    >
      <Text className="text-error text-xl font-bold text-center mb-2" accessibilityRole="header">
        Something went wrong
      </Text>
      <Text className="text-text-muted dark:text-slate-400 text-center mb-6">{message}</Text>
      {onRetry && (
        <Button
          title="Try Again"
          onPress={onRetry}
          variant="outline"
          loading={isRetrying}
          disabled={isRetrying}
          accessibilityLabel={isRetrying ? "Retrying, please wait" : "Try again"}
          accessibilityHint="Retries the failed operation"
        />
      )}
    </View>
  );
};

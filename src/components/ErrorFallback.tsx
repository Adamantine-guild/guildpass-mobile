import React from "react";
import { View, Text } from "react-native";
import { Button } from "./Button";
import { ErrorCategory, ErrorSeverity } from "../lib/errorLogger";

interface ErrorFallbackProps {
  category: ErrorCategory;
  severity: ErrorSeverity;
  message?: string;
  onRetry?: () => void;
  onGoHome?: () => void;
  testID?: string;
}

const CATEGORY_MESSAGES: Record<ErrorCategory, { title: string; description: string }> = {
  [ErrorCategory.RENDER]: {
    title: "Display Error",
    description: "A component failed to render. This has been logged for investigation.",
  },
  [ErrorCategory.NETWORK]: {
    title: "Connection Lost",
    description: "Unable to reach the server. Please check your internet connection.",
  },
  [ErrorCategory.STORAGE]: {
    title: "Storage Error",
    description:
      "Local data storage encountered an issue. Some features may be temporarily unavailable.",
  },
  [ErrorCategory.WALLET]: {
    title: "Wallet Error",
    description: "A wallet operation failed. You may need to reconnect your wallet.",
  },
  [ErrorCategory.SYNC]: {
    title: "Sync Error",
    description: "Data synchronization encountered an issue. Your local data is safe.",
  },
  [ErrorCategory.UNKNOWN]: {
    title: "Something Went Wrong",
    description: "An unexpected error occurred. Please try again.",
  },
};

export const ErrorFallback = ({
  category,
  severity,
  message,
  onRetry,
  onGoHome,
  testID,
}: ErrorFallbackProps) => {
  const config = CATEGORY_MESSAGES[category];

  return (
    <View
      className="flex-1 justify-center items-center p-6 bg-background"
      testID={testID ?? "error-fallback"}
      accessibilityLabel={`${config.title}: ${message ?? config.description}`}
    >
      {severity === ErrorSeverity.CRITICAL && (
        <View className="bg-error/10 rounded-full w-16 h-16 justify-center items-center mb-4">
          <Text className="text-error text-2xl font-bold">!</Text>
        </View>
      )}

      <Text
        className={`text-xl font-bold text-center mb-2 ${
          severity === ErrorSeverity.CRITICAL ? "text-error" : "text-text-primary"
        }`}
      >
        {config.title}
      </Text>

      <Text className="text-text-muted text-center mb-8 text-sm leading-5">
        {message ?? config.description}
      </Text>

      <View className="w-full gap-3" testID="error-fallback-actions">
        {onRetry && (
          <Button
            title="Try Again"
            onPress={onRetry}
            variant="primary"
            testID="error-fallback-retry"
            accessibilityHint="Attempt to recover from this error"
          />
        )}
        {onGoHome && (
          <Button
            title="Go to Home"
            onPress={onGoHome}
            variant="outline"
            testID="error-fallback-home"
            accessibilityHint="Navigate back to the home screen"
          />
        )}
      </View>

      {__DEV__ && (
        <View
          className="mt-6 px-4 py-3 bg-slate-100 rounded-lg w-full"
          testID="error-fallback-diagnostics"
        >
          <Text className="text-xs text-text-muted font-mono">
            [{category}:{severity}] {message ?? "No additional details"}
          </Text>
        </View>
      )}
    </View>
  );
};

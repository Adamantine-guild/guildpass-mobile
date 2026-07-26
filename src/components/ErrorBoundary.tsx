import React, { Component, ErrorInfo, ReactNode } from "react";
import { View, Text, ScrollView } from "react-native";
import { Button } from "./Button";
import { logError, ErrorCategory, ErrorSeverity, DiagnosticInfo } from "../lib/errorLogger";

interface Props {
  children: ReactNode;
  context?: string;
  fallback?: ReactNode;
  onError?: (diagnostic: DiagnosticInfo) => void;
}

interface State {
  hasError: boolean;
  diagnostic: DiagnosticInfo | null;
}

/**
 * App-wide error boundary that catches unexpected rendering errors,
 * logs structured diagnostic information, and presents a safe recovery
 * screen instead of crashing.
 *
 * Supports:
 * - Automatic error classification (render, network, storage, etc.)
 * - Structured diagnostic logging
 * - Custom fallback UI per boundary
 * - Recovery actions (retry, go home)
 * - Error callback for external reporting
 *
 * Does not log wallet addresses, private keys, or other sensitive user data.
 */
export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, diagnostic: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, diagnostic: null };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    const diagnostic = logError(
      error,
      { componentStack: errorInfo.componentStack ?? undefined },
      this.props.context ?? "render",
    );

    this.setState({ diagnostic });

    this.props.onError?.(diagnostic);
  }

  handleRetry = (): void => {
    this.setState({ hasError: false, diagnostic: null });
  };

  private getErrorMessage(): string {
    if (__DEV__ && this.state.diagnostic) {
      return this.state.diagnostic.message;
    }
    return "An unexpected error occurred. Please try again.";
  }

  private getCategoryLabel(): string {
    if (!this.state.diagnostic) return "Error";
    switch (this.state.diagnostic.category) {
      case ErrorCategory.NETWORK:
        return "Network Error";
      case ErrorCategory.STORAGE:
        return "Storage Error";
      case ErrorCategory.WALLET:
        return "Wallet Error";
      case ErrorCategory.SYNC:
        return "Sync Error";
      case ErrorCategory.RENDER:
        return "Rendering Error";
      default:
        return "Something went wrong";
    }
  }

  private getRecoveryHint(): string | null {
    if (!this.state.diagnostic) return null;
    if (!this.state.diagnostic.recoverable) {
      return "This error requires the app to be restarted.";
    }
    switch (this.state.diagnostic.category) {
      case ErrorCategory.NETWORK:
        return "Check your internet connection and try again.";
      case ErrorCategory.STORAGE:
        return "Local storage encountered an issue. Retrying may help.";
      case ErrorCategory.WALLET:
        return "A wallet operation failed. You may need to reconnect.";
      case ErrorCategory.SYNC:
        return "Sync encountered an issue. Retrying may help.";
      default:
        return null;
    }
  }

  render(): ReactNode {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      const recoveryHint = this.getRecoveryHint();
      const isUnrecoverable = this.state.diagnostic?.recoverable === false;

      return (
        <View className="flex-1 bg-background" testID="error-boundary-fallback">
          <ScrollView
            contentContainerStyle={{
              flexGrow: 1,
              justifyContent: "center",
              alignItems: "center",
              padding: 24,
            }}
          >
            <Text className="text-error text-xl font-bold text-center mb-3">
              {this.getCategoryLabel()}
            </Text>
            <Text className="text-text-muted text-center mb-2 text-sm">
              {this.getErrorMessage()}
            </Text>
            {recoveryHint && (
              <Text className="text-text-muted text-center mb-8 text-xs italic">
                {recoveryHint}
              </Text>
            )}
            {!recoveryHint && <View className="mb-8" />}
            <Button
              title={isUnrecoverable ? "Restart App" : "Try Again"}
              onPress={this.handleRetry}
              variant={isUnrecoverable ? "danger" : "primary"}
              testID="error-boundary-retry"
              accessibilityHint="Attempt to recover from the error"
            />
          </ScrollView>
        </View>
      );
    }

    return this.props.children;
  }
}

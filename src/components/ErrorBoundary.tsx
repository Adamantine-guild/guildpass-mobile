import React, { Component, ErrorInfo, ReactNode } from "react";
import { View, Text, ScrollView } from "react-native";
import { Button } from "./Button";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

/**
 * App-wide error boundary that catches unexpected rendering errors
 * and presents a safe recovery screen instead of crashing.
 *
 * Does not log wallet addresses, private keys, or other sensitive user data.
 */
export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    // In development, log the error and component stack for debugging.
    // We intentionally avoid logging any user-specific data.
    if (__DEV__) {
      console.error("[ErrorBoundary] Render error:", error.message);
      console.error("[ErrorBoundary] Component stack:", errorInfo.componentStack);
    }
  }

  handleRetry = (): void => {
    this.setState({ hasError: false, error: null });
  };

  getErrorMessage(): string {
    if (__DEV__ && this.state.error) {
      return this.state.error.message;
    }
    return "An unexpected error occurred. Please try again.";
  }

  render(): ReactNode {
    if (this.state.hasError) {
      return (
        <View
          className="flex-1 bg-background"
          testID="error-boundary-fallback"
        >
          <ScrollView
            contentContainerStyle={{
              flexGrow: 1,
              justifyContent: "center",
              alignItems: "center",
              padding: 24,
            }}
          >
            <Text className="text-error text-xl font-bold text-center mb-3">
              Something went wrong
            </Text>
            <Text className="text-text-muted text-center mb-8 text-sm">
              {this.getErrorMessage()}
            </Text>
            <Button
              title="Try Again"
              onPress={this.handleRetry}
              variant="primary"
              testID="error-boundary-retry"
            />
          </ScrollView>
        </View>
      );
    }

    return this.props.children;
  }
}

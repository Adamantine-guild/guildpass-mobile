import React, { Component, ErrorInfo, ReactNode } from "react";
import { logError, DiagnosticInfo } from "../lib/errorLogger";
import { ErrorFallback } from "./ErrorFallback";

interface ScreenErrorBoundaryProps {
  children: ReactNode;
  screenName: string;
  onReset?: () => void;
}

interface ScreenErrorBoundaryState {
  hasError: boolean;
  diagnostic: DiagnosticInfo | null;
}

/**
 * Per-screen error boundary that isolates rendering failures to individual
 * screens. When a screen crashes, only that screen is replaced with a
 * recovery UI -- the rest of the app (navigation, providers, overlays)
 * remains functional.
 *
 * This is the recommended boundary for wrapping Expo Router screens.
 */
export class ScreenErrorBoundary extends Component<
  ScreenErrorBoundaryProps,
  ScreenErrorBoundaryState
> {
  constructor(props: ScreenErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, diagnostic: null };
  }

  static getDerivedStateFromError(error: Error): ScreenErrorBoundaryState {
    return { hasError: true, diagnostic: null };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    const diagnostic = logError(
      error,
      { componentStack: errorInfo.componentStack ?? undefined },
      `screen:${this.props.screenName}`,
    );

    this.setState({ diagnostic });
  }

  handleRetry = (): void => {
    this.setState({ hasError: false, diagnostic: null });
  };

  handleGoHome = (): void => {
    this.setState({ hasError: false, diagnostic: null });
    this.props.onReset?.();
  };

  render(): ReactNode {
    if (this.state.hasError && this.state.diagnostic) {
      return (
        <ErrorFallback
          category={this.state.diagnostic.category}
          severity={this.state.diagnostic.severity}
          message={__DEV__ ? this.state.diagnostic.message : undefined}
          onRetry={this.handleRetry}
          onGoHome={this.handleGoHome}
          testID={`screen-error-${this.props.screenName}`}
        />
      );
    }

    return this.props.children;
  }
}

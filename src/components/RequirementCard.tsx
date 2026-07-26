import React, { Component, ErrorInfo, ReactNode } from "react";
import { View, Text } from "react-native";
import { Card } from "./Card";
import { isKnownChainId, getChainDisplayName } from "../lib/chainRegistry";

// ---------------------------------------------------------------------------
// Scoped error boundary for a single requirement card
// ---------------------------------------------------------------------------

interface RequirementErrorBoundaryState {
  hasError: boolean;
}

interface RequirementErrorBoundaryProps {
  children: ReactNode;
  fallback: ReactNode;
}

/**
 * A narrow error boundary scoped to a single role-requirement card.
 *
 * When a child throws (e.g., due to an unexpected field value from the server),
 * only this card is replaced with the `fallback` element. The rest of the guild
 * detail screen continues to render normally.
 *
 * Does not log any user-specific data.
 */
class RequirementErrorBoundary extends Component<
  RequirementErrorBoundaryProps,
  RequirementErrorBoundaryState
> {
  constructor(props: RequirementErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): RequirementErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    if (__DEV__) {
      console.warn("[RequirementErrorBoundary] Caught render error:", error.message);
      console.warn("[RequirementErrorBoundary] Component stack:", errorInfo.componentStack);
    }
  }

  render(): ReactNode {
    if (this.state.hasError) {
      return this.props.fallback;
    }
    return this.props.children;
  }
}

// ---------------------------------------------------------------------------
// Unsupported-network fallback card
// ---------------------------------------------------------------------------

interface UnsupportedNetworkCardProps {
  chainId: number;
  testID?: string;
}

/**
 * Renders a clearly-labelled "Unsupported network" placeholder for a role
 * requirement whose chain ID the app does not yet recognise.
 *
 * The card is intentionally non-interactive and accessible.
 */
export const UnsupportedNetworkCard = ({ chainId, testID }: UnsupportedNetworkCardProps) => {
  return (
    <Card
      className="mb-3 border border-border opacity-60"
      accessibilityLabel={`Unsupported network: chain ID ${chainId} is not recognised by this version of the app`}
      testID={testID ?? "unsupported-network-card"}
    >
      <View className="flex-row items-center" testID="unsupported-network-inner">
        <View className="bg-text-muted/15 px-2 py-1 rounded mr-3">
          <Text className="text-text-muted text-xs font-bold" testID="unsupported-network-label">
            ⚠ Unsupported network
          </Text>
        </View>
        <Text className="text-text-muted text-xs flex-1" testID="unsupported-network-chain-id">
          Chain ID {chainId}
        </Text>
      </View>
    </Card>
  );
};

// ---------------------------------------------------------------------------
// RequirementCard
// ---------------------------------------------------------------------------

interface RequirementCardProps {
  /**
   * The chain ID for this role requirement. If the ID is not in the app's
   * chain registry the card renders the "Unsupported network" fallback instead
   * of the normal content, without breaking sibling cards.
   */
  chainId: number;
  /** Content to render when the chain ID is recognised. */
  children: ReactNode;
  testID?: string;
}

/**
 * A card that wraps a single role-requirement's chain-dependent rendering.
 *
 * Behaviour:
 *  - Known chain ID → renders `children` normally inside a scoped error boundary.
 *  - Unknown chain ID → renders `UnsupportedNetworkCard` without touching
 *    any sibling cards or the rest of the guild detail screen.
 *
 * The scoped error boundary also catches unexpected render errors from children
 * (e.g., malformed data from the server) and replaces only this card with the
 * unsupported-network fallback.
 */
export const RequirementCard = ({ chainId, children, testID }: RequirementCardProps) => {
  const fallback = (
    <UnsupportedNetworkCard
      chainId={chainId}
      testID={testID ? `${testID}-unsupported` : undefined}
    />
  );

  if (!isKnownChainId(chainId)) {
    return fallback;
  }

  return (
    <RequirementErrorBoundary fallback={fallback}>
      <View testID={testID}>{children}</View>
    </RequirementErrorBoundary>
  );
};

// ---------------------------------------------------------------------------
// Re-export helpers so screens don't need to import from two places
// ---------------------------------------------------------------------------
export { isKnownChainId, getChainDisplayName };

/**
 * Registry of wallet connector types the build knows about.
 *
 * Replaces a hardcoded `Record<WalletConnectorType, boolean>` in which `coinbase`
 * and `metamask` sat at `false` — the one place in the codebase that literally
 * required editing core to add an integration. Adding a wallet is now: export a
 * factory, register a descriptor.
 *
 * Descriptors, not factories, deliberately: `createManualConnector` takes an
 * address and `createWalletConnectConnector` takes an EIP-1193 provider, so a
 * `Map<type, factory>` would have to erase those argument types to `unknown` for
 * no caller's benefit. The descriptor answers "does this build support X?"; the
 * call site that constructs a connector already holds the SDK handle it needs.
 *
 * Built-ins are seeded at module load rather than at app bootstrap, because
 * `isConnectorTypeSupported()` gates UI affordances and must not depend on
 * initialisation ordering — the same rule the credential registries follow.
 *
 * This module deliberately imports nothing but its own types. `walletConnector.service`
 * re-exports `isConnectorTypeSupported`, so anything that module reaches also
 * reaches here; pulling in `appConfig` dragged `expo-constants` (Flow-typed, and
 * unparseable by Vite) into every consumer's graph and broke unrelated suites.
 *
 * Consequently the registry answers "does this build ship an implementation for
 * this connector type?", not "is it configured right now". Runtime configuration
 * gating stays where it already lives — `isEmbeddedWalletEnabled` in
 * `EmbeddedWalletProvider.tsx` for the embedded path. `isAvailable` remains on the
 * descriptor so a future connector can gate itself without that constraint.
 */

import { WalletConnectorType } from "./walletConnector.types";

export type WalletConnectorDescriptor = {
  type: WalletConnectorType;
  /** Human-readable name for connector pickers. */
  label: string;
  /** Whether this build is configured to offer the connector. */
  isAvailable(): boolean;
};

const BUILT_IN_DESCRIPTORS: readonly WalletConnectorDescriptor[] = [
  { type: "manual", label: "Enter address manually", isAvailable: () => true },
  { type: "walletconnect", label: "WalletConnect", isAvailable: () => true },
  { type: "embedded", label: "Email or social sign-in", isAvailable: () => true },
  // coinbase / metamask are intentionally absent: no connector implementation
  // ships yet, so they report unsupported rather than being listed as `false`.
];

const descriptors = new Map<WalletConnectorType, WalletConnectorDescriptor>();

const seedBuiltIns = (): void => {
  for (const descriptor of BUILT_IN_DESCRIPTORS) {
    descriptors.set(descriptor.type, descriptor);
  }
};

seedBuiltIns();

/** Register a connector type. Re-registering the same type replaces it. */
export function registerWalletConnector(descriptor: WalletConnectorDescriptor): void {
  descriptors.set(descriptor.type, descriptor);
}

/**
 * Whether the build supports a connector type at all.
 *
 * Unregistered types are unsupported; registered ones defer to `isAvailable()`,
 * so a connector whose configuration is missing reports unsupported too.
 */
export function isConnectorTypeSupported(type: WalletConnectorType): boolean {
  const descriptor = descriptors.get(type);
  return descriptor !== undefined && descriptor.isAvailable();
}

/** Descriptors this build can actually offer right now. */
export function listAvailableConnectors(): WalletConnectorDescriptor[] {
  return Array.from(descriptors.values()).filter((descriptor) => descriptor.isAvailable());
}

/** Every registered descriptor, available or not. */
export function listRegisteredConnectors(): WalletConnectorDescriptor[] {
  return Array.from(descriptors.values());
}

/** Test-only: drop registrations and restore the built-in set. */
export function resetWalletConnectorRegistry(): void {
  descriptors.clear();
  seedBuiltIns();
}

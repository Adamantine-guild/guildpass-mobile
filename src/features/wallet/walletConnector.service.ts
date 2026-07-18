import { WalletConnector, WalletConnectorType } from "./walletConnector.types";
import type {
  EmbeddedWalletProvider,
  SocialIdentity,
  SocialLoginMethod,
  SocialLoginParams,
} from "./embeddedWallet.types";

/**
 * Manual connector — wraps a pre-validated address so the connector interface
 * stays consistent across all provider types.
 */
export function createManualConnector(address: string): WalletConnector {
  return {
    type: "manual",
    async connect() {
      return [address];
    },
    async disconnect() {},
    async reconnect() {
      return [address];
    },
    async getAccounts() {
      return [address];
    },
  };
}

/**
 * WalletConnect stub — wire up the real WC SDK when the package is added.
 * Throws until a real implementation is provided.
 */
export function createWalletConnectConnector(): WalletConnector {
  const notImplemented = (): never => {
    throw new Error("WalletConnect SDK not yet configured. Add @walletconnect/modal-react-native and a project ID.");
  };
  return {
    type: "walletconnect",
    connect: notImplemented,
    disconnect: notImplemented,
    reconnect: notImplemented,
    getAccounts: notImplemented,
  };
}

/**
 * Embedded connector — social login + provider-provisioned wallet behind the
 * standard connector interface, so the resulting address flows through the
 * exact same connectWithConnector → wallet store path as every other
 * connector type (no special-casing downstream).
 */
export function createEmbeddedConnector(
  provider: EmbeddedWalletProvider,
  method: SocialLoginMethod,
  params?: SocialLoginParams,
): WalletConnector {
  let identity: SocialIdentity | null = null;
  let address: string | null = null;

  const loginAndProvision = async (): Promise<string[]> => {
    identity = identity ?? (await provider.login(method, params));
    if (!address) {
      address = (await provider.provisionWallet(identity)).address;
    }
    return [address];
  };

  return {
    type: "embedded",
    connect: loginAndProvision,
    reconnect: loginAndProvision,
    async getAccounts() {
      return address ? [address] : [];
    },
    async disconnect() {
      await provider.logout();
      identity = null;
      address = null;
    },
  };
}

/** Registry of available connector factories */
const connectorFactories: Record<WalletConnectorType, (() => WalletConnector) | null> = {
  manual: null, // constructed via createManualConnector(address)
  walletconnect: createWalletConnectConnector,
  coinbase: null, // future: createCoinbaseConnector
  metamask: null, // future: createMetaMaskConnector
  embedded: null, // constructed via createEmbeddedConnector(provider, method, params)
};

export function isConnectorTypeSupported(type: WalletConnectorType): boolean {
  return connectorFactories[type] !== null;
}

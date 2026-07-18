import { WalletConnector, WalletConnectorType } from "./walletConnector.types";

/**
 * Manual connector — wraps a pre-validated address so the connector interface
 * stays consistent across all provider types.
 *
 * It CANNOT sign messages: a manually-entered address carries no proof of key
 * ownership, so `signMessage` rejects. This is intentional — it forces the app
 * to use the no-op session (or a real signing connector) rather than pretending
 * an arbitrary typed address is authenticated.
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
    async signMessage() {
      throw new Error("Manual connector cannot sign: it holds no private key. Connect a real wallet to sign in with SIWE.");
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
    signMessage: notImplemented,
  };
}

/**
 * Signing connector — wraps a wallet that CAN sign (e.g. an embedded key, a
 * WalletConnect session, or a hardware wallet) behind the common interface.
 *
 * `signMessage` is injected so the SIWE session adapter can use this connector
 * as its signer without depending on any particular wallet SDK.
 */
export function createSigningConnector(
  type: WalletConnectorType,
  signMessage: (message: string) => Promise<string>,
  accounts: string[],
): WalletConnector {
  return {
    type,
    async connect() {
      return accounts;
    },
    async disconnect() {},
    async reconnect() {
      return accounts;
    },
    async getAccounts() {
      return accounts;
    },
    async signMessage(message: string) {
      return signMessage(message);
    },
  };
}

/** Registry of available connector factories */
const connectorFactories: Record<WalletConnectorType, (() => WalletConnector) | null> = {
  manual: null, // constructed via createManualConnector(address)
  walletconnect: createWalletConnectConnector,
  coinbase: null, // future: createCoinbaseConnector
  metamask: null, // future: createMetaMaskConnector
};

export function isConnectorTypeSupported(type: WalletConnectorType): boolean {
  return connectorFactories[type] !== null;
}

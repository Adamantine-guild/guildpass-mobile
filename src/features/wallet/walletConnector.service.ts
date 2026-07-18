import { WalletConnector, WalletConnectorType } from "./walletConnector.types";

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
 * WalletConnect connector factory.
 *
 * The connector receives a reference to the WC provider (EIP-1193) so
 * that it can call `eth_requestAccounts` / `eth_accounts` / `disconnect`.
 * The caller is responsible for opening the WC modal before calling
 * `connect()`, and for disposing of the WC session on `disconnect()`.
 */
export function createWalletConnectConnector(provider: {
  request(args: { method: string }): Promise<unknown>;
  disconnect(): Promise<void>;
}): WalletConnector {
  return {
    type: "walletconnect",
    async connect() {
      const accounts = (await provider.request({
        method: "eth_requestAccounts",
      })) as string[];
      if (!accounts.length) {
        throw new Error("WalletConnect: no accounts returned");
      }
      return accounts;
    },
    async disconnect() {
      await provider.disconnect();
    },
    async reconnect() {
      const accounts = (await provider.request({
        method: "eth_accounts",
      })) as string[];
      return accounts;
    },
    async getAccounts() {
      const accounts = (await provider.request({
        method: "eth_accounts",
      })) as string[];
      return accounts;
    },
  };
}

/** Registry of available connector factories */
const connectorFactories: Record<WalletConnectorType, boolean> = {
  manual: true,
  walletconnect: true,
  coinbase: false,
  metamask: false,
};

export function isConnectorTypeSupported(type: WalletConnectorType): boolean {
  return connectorFactories[type] === true;
}

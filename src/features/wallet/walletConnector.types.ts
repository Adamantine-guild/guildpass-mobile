export type WalletConnectorType = "manual" | "walletconnect" | "coinbase" | "metamask";

export interface WalletConnector {
  type: WalletConnectorType;
  connect(): Promise<string[]>;
  disconnect(): Promise<void>;
  reconnect(): Promise<string[]>;
  getAccounts(): Promise<string[]>;
  /**
   * Sign an arbitrary message (e.g. a SIWE sign-in) with the wallet's key.
   * Required for the SIWE session. Connectors that cannot sign (a manually
   * entered address) must reject this — that is what prevents an unproven
   * address from being treated as authenticated.
   */
  signMessage(message: string): Promise<string>;
}

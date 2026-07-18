export type WalletConnectorType = "manual" | "walletconnect" | "coinbase" | "metamask" | "embedded";

export interface WalletConnector {
  type: WalletConnectorType;
  connect(): Promise<string[]>;
  disconnect(): Promise<void>;
  reconnect(): Promise<string[]>;
  getAccounts(): Promise<string[]>;
}

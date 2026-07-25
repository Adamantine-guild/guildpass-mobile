/**
 * `embedded` is provisioned by the configured embedded-wallet provider. It goes
 * through the same connector interface as external wallets so `useWallet` has one
 * connect path rather than a special case that writes to the store directly.
 */
export type WalletConnectorType =
  | "manual"
  | "walletconnect"
  | "embedded"
  | "coinbase"
  | "metamask";

export interface WalletConnector {
  type: WalletConnectorType;
  connect(): Promise<string[]>;
  disconnect(): Promise<void>;
  reconnect(): Promise<string[]>;
  getAccounts(): Promise<string[]>;
}

/**
 * Barrel export for the wallet adapter module.
 *
 * Consumers should import from this file rather than from individual adapter
 * modules to keep import paths stable as the directory grows.
 *
 * @example
 * import { WalletAdapter, WalletAdapterError, adapterRegistry } from "@/features/wallet/adapter";
 */

export type {
  WalletAdapter,
  WalletAdapterType,
  SessionChangeEvent,
  SessionChangeCallback,
  UnsubscribeFn,
  WalletAdapterErrorCode,
} from "./walletAdapter.interface";

export { WalletAdapterError } from "./walletAdapter.interface";

export { ManualAdapter } from "./manual.adapter";
export { WalletConnectAdapter } from "./walletConnect.adapter";
export type { WalletConnectProviderLike } from "./walletConnect.adapter";
export { MetaMaskAdapter } from "./metaMask.adapter";
export type { MetaMaskProviderLike } from "./metaMask.adapter";
export { CoinbaseAdapter } from "./coinbase.adapter";
export type { CoinbaseProviderLike } from "./coinbase.adapter";
export { MockAdapter } from "./mock.adapter";
export { adapterRegistry, AdapterRegistry } from "./adapterRegistry";

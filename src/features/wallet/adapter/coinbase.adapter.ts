/**
 * CoinbaseAdapter — implements WalletAdapter via the Coinbase Wallet SDK.
 *
 * The Coinbase Wallet SDK for React Native (@coinbase/wallet-sdk or the
 * dedicated mobile SDK) exposes an EIP-1193-compatible provider, so this
 * adapter is structurally similar to the MetaMaskAdapter.
 *
 * Key differences from MetaMask on mobile:
 *  - The SDK handles the deep-link / WalletLink session automatically.
 *  - `disconnect()` is explicitly supported via `close()` on the SDK instance.
 *  - Chain-switching follows the same `wallet_switchEthereumChain` pattern.
 *
 * Pass an initialised `CoinbaseProviderLike` (from `@coinbase/wallet-sdk`)
 * to the constructor. The adapter is fully testable without the real SDK.
 */

import {
  WalletAdapter,
  WalletAdapterError,
  SessionChangeCallback,
  UnsubscribeFn,
  SessionChangeEvent,
} from "./walletAdapter.interface";

/**
 * Duck-type for the Coinbase Wallet SDK provider (EIP-1193 + explicit close).
 */
export interface CoinbaseProviderLike {
  request(args: { method: string; params?: unknown[] }): Promise<unknown>;
  on(event: string, listener: (...args: unknown[]) => void): void;
  removeListener(event: string, listener: (...args: unknown[]) => void): void;
  /** Coinbase SDK exposes an explicit close/disconnect call. */
  close?(): void;
}

export class CoinbaseAdapter implements WalletAdapter {
  readonly type = "coinbase" as const;

  private provider: CoinbaseProviderLike;
  private listeners: Set<SessionChangeCallback> = new Set();
  private _currentAddress: string | null = null;

  private onAccountsChanged = (accounts: unknown) => {
    const addr =
      Array.isArray(accounts) && accounts.length > 0
        ? String(accounts[0]).toLowerCase()
        : null;
    this._currentAddress = addr;
    this.listeners.forEach((cb) => cb({ address: addr, chainId: null }));
  };

  private onChainChanged = (chainId: unknown) => {
    this.listeners.forEach((cb) => ({
      address: this._currentAddress,
      chainId: chainId ? Number(String(chainId)) : null,
    }));
    this.listeners.forEach((cb) =>
      cb({
        address: this._currentAddress,
        chainId: chainId ? Number(String(chainId)) : null,
      })
    );
  };

  private onDisconnect = () => {
    this._currentAddress = null;
    this.listeners.forEach((cb) => cb({ address: null, chainId: null }));
  };

  constructor(provider: CoinbaseProviderLike) {
    if (!provider) {
      throw new WalletAdapterError(
        "CoinbaseAdapter requires a provider. " +
          "Install @coinbase/wallet-sdk and pass the initialised provider.",
        "PROVIDER_NOT_FOUND"
      );
    }
    this.provider = provider;
    this.provider.on("accountsChanged", this.onAccountsChanged);
    this.provider.on("chainChanged", this.onChainChanged);
    this.provider.on("disconnect", this.onDisconnect);
  }

  async connect(): Promise<string[]> {
    try {
      const accounts = (await this.provider.request({
        method: "eth_requestAccounts",
      })) as string[];

      if (!Array.isArray(accounts) || accounts.length === 0) {
        throw new WalletAdapterError(
          "Coinbase Wallet returned no accounts.",
          "USER_REJECTED"
        );
      }

      this._currentAddress = accounts[0].toLowerCase();
      return accounts.map((a) => a.toLowerCase());
    } catch (err) {
      if (err instanceof WalletAdapterError) throw err;

      const isRejection =
        err instanceof Error &&
        (err.message.includes("4001") ||
          err.message.toLowerCase().includes("user rejected") ||
          err.message.toLowerCase().includes("user denied"));

      throw new WalletAdapterError(
        `Coinbase Wallet connection failed: ${err instanceof Error ? err.message : String(err)}`,
        isRejection ? "USER_REJECTED" : "CONNECTION_FAILED",
        err
      );
    }
  }

  async disconnect(): Promise<void> {
    // Use the SDK's explicit close() if available.
    if (typeof this.provider.close === "function") {
      this.provider.close();
    }
    this._currentAddress = null;
    this.listeners.forEach((cb) => cb({ address: null, chainId: null }));
  }

  async getAddress(): Promise<string | null> {
    try {
      const accounts = (await this.provider.request({
        method: "eth_accounts",
      })) as string[];

      if (Array.isArray(accounts) && accounts.length > 0) {
        this._currentAddress = accounts[0].toLowerCase();
        return this._currentAddress;
      }
      return null;
    } catch {
      return null;
    }
  }

  async signMessage(message: string): Promise<string> {
    const address = this._currentAddress ?? (await this.getAddress());
    if (!address) {
      throw new WalletAdapterError(
        "Cannot sign: no active Coinbase Wallet account.",
        "NOT_CONNECTED"
      );
    }

    try {
      const signature = (await this.provider.request({
        method: "personal_sign",
        params: [message, address],
      })) as string;

      return signature;
    } catch (err) {
      const isRejection =
        err instanceof Error &&
        (err.message.includes("4001") ||
          err.message.toLowerCase().includes("user rejected") ||
          err.message.toLowerCase().includes("user denied"));

      throw new WalletAdapterError(
        `Coinbase Wallet signMessage failed: ${err instanceof Error ? err.message : String(err)}`,
        isRejection ? "USER_REJECTED" : "SIGNING_FAILED",
        err
      );
    }
  }

  async switchChain(chainId: number): Promise<void> {
    const hexChainId = `0x${chainId.toString(16)}`;
    try {
      await this.provider.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: hexChainId }],
      });
    } catch (err) {
      throw new WalletAdapterError(
        `Coinbase Wallet switchChain to ${chainId} failed: ${err instanceof Error ? err.message : String(err)}`,
        "CHAIN_UNSUPPORTED",
        err
      );
    }
  }

  onSessionChange(callback: SessionChangeCallback): UnsubscribeFn {
    this.listeners.add(callback);
    return () => {
      this.listeners.delete(callback);
    };
  }

  /** Remove all provider event listeners. Call when tearing down the adapter. */
  destroy(): void {
    this.provider.removeListener("accountsChanged", this.onAccountsChanged);
    this.provider.removeListener("chainChanged", this.onChainChanged);
    this.provider.removeListener("disconnect", this.onDisconnect);
    this.listeners.clear();
  }
}

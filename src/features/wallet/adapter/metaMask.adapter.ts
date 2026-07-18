/**
 * MetaMaskAdapter — implements WalletAdapter via deep-link / MetaMask SDK for
 * React Native.
 *
 * On mobile, MetaMask is reached through one of two mechanisms:
 *   1. Deep-link (universal link / custom scheme) — works when only
 *      `expo-linking` is available; limited to `eth_requestAccounts` and
 *      `personal_sign` flows that can be serialised into a URL.
 *   2. MetaMask SDK (@metamask/sdk-react-native) — richer flow with a
 *      persistent Ethereum provider object, supporting `eth_accounts`,
 *      `personal_sign`, and `wallet_switchEthereumChain`.
 *
 * This adapter accepts a `MetaMaskProviderLike` duck-type in its constructor,
 * keeping it fully testable without the real SDK installed. When no provider
 * is supplied it falls back to raising a `PROVIDER_NOT_FOUND` error that
 * guides developers toward installing the SDK.
 */

import {
  WalletAdapter,
  WalletAdapterError,
  SessionChangeCallback,
  UnsubscribeFn,
  SessionChangeEvent,
} from "./walletAdapter.interface";

/**
 * Minimum surface we need from the MetaMask SDK / injected provider.
 * Mirrors the EIP-1193 interface used by MetaMask SDK for React Native.
 */
export interface MetaMaskProviderLike {
  request(args: { method: string; params?: unknown[] }): Promise<unknown>;
  on(event: string, listener: (...args: unknown[]) => void): void;
  removeListener(event: string, listener: (...args: unknown[]) => void): void;
}

export class MetaMaskAdapter implements WalletAdapter {
  readonly type = "metamask" as const;

  private provider: MetaMaskProviderLike;
  private listeners: Set<SessionChangeCallback> = new Set();

  /** Bound references kept so we can call `removeListener` later. */
  private onAccountsChanged = (accounts: unknown) => {
    const addr = Array.isArray(accounts) && accounts.length > 0
      ? String(accounts[0]).toLowerCase()
      : null;
    const event: SessionChangeEvent = { address: addr, chainId: null };
    this.listeners.forEach((cb) => cb(event));
  };

  private onChainChanged = (chainId: unknown) => {
    const address = this._currentAddress;
    const event: SessionChangeEvent = {
      address,
      chainId: chainId ? Number(String(chainId)) : null,
    };
    this.listeners.forEach((cb) => cb(event));
  };

  private onDisconnect = () => {
    this._currentAddress = null;
    const event: SessionChangeEvent = { address: null, chainId: null };
    this.listeners.forEach((cb) => cb(event));
  };

  private _currentAddress: string | null = null;

  constructor(provider: MetaMaskProviderLike) {
    if (!provider) {
      throw new WalletAdapterError(
        "MetaMaskAdapter requires a provider. " +
          "Install @metamask/sdk-react-native and pass the Ethereum provider object.",
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
          "MetaMask returned no accounts. The user may have rejected the connection.",
          "USER_REJECTED"
        );
      }

      this._currentAddress = accounts[0].toLowerCase();
      return accounts.map((a) => a.toLowerCase());
    } catch (err) {
      if (err instanceof WalletAdapterError) throw err;

      const code =
        err instanceof Error &&
        (err.message.includes("4001") || err.message.toLowerCase().includes("user rejected"))
          ? "USER_REJECTED"
          : "CONNECTION_FAILED";

      throw new WalletAdapterError(
        `MetaMask connection failed: ${err instanceof Error ? err.message : String(err)}`,
        code,
        err
      );
    }
  }

  async disconnect(): Promise<void> {
    // MetaMask does not expose a programmatic disconnect; we clear local state
    // and notify listeners.
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
        "Cannot sign: no active MetaMask account.",
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
        `MetaMask signMessage failed: ${err instanceof Error ? err.message : String(err)}`,
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
        `MetaMask switchChain to ${chainId} failed: ${err instanceof Error ? err.message : String(err)}`,
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

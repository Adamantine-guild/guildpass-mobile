import {
  WalletAdapter,
  WalletAdapterError,
  SessionChangeCallback,
  UnsubscribeFn,
  SessionChangeEvent,
} from "./walletAdapter.interface";
import { validateAndNormalizeAddress } from "../../../lib/walletValidation";

/**
 * ManualAdapter — wraps a pre-entered Ethereum address so that the rest of the
 * wallet infrastructure can treat it identically to any other provider.
 *
 * - No SDK required; no UI modal is shown.
 * - `signMessage` and `switchChain` are no-ops (manual entry has no signer).
 * - Session-change callbacks are invoked synchronously when the address changes.
 */
export class ManualAdapter implements WalletAdapter {
  readonly type = "manual" as const;

  private address: string | null = null;
  private listeners: Set<SessionChangeCallback> = new Set();

  constructor(address?: string) {
    if (address !== undefined) {
      const result = validateAndNormalizeAddress(address);
      if (!result.valid) {
        throw new WalletAdapterError(
          `ManualAdapter: invalid address — ${result.error}`,
          "CONNECTION_FAILED"
        );
      }
      this.address = result.address;
    }
  }

  async connect(): Promise<string[]> {
    if (!this.address) {
      throw new WalletAdapterError(
        "ManualAdapter: no address provided. Pass an address to the constructor.",
        "CONNECTION_FAILED"
      );
    }
    this._emit({ address: this.address, chainId: null });
    return [this.address];
  }

  async disconnect(): Promise<void> {
    this.address = null;
    this._emit({ address: null, chainId: null });
  }

  async getAddress(): Promise<string | null> {
    return this.address;
  }

  /**
   * Manual entry has no signer — signing is not supported.
   * Throws `NOT_IMPLEMENTED` rather than silently succeeding with a fake signature.
   */
  async signMessage(_message: string): Promise<string> {
    throw new WalletAdapterError(
      "ManualAdapter does not support message signing. Use a WalletConnect or injected provider adapter.",
      "NOT_IMPLEMENTED"
    );
  }

  /**
   * Manual entry has no chain context — chain switching is a no-op.
   */
  async switchChain(_chainId: number): Promise<void> {
    // Intentional no-op: manual addresses are chain-agnostic.
  }

  onSessionChange(callback: SessionChangeCallback): UnsubscribeFn {
    this.listeners.add(callback);
    return () => {
      this.listeners.delete(callback);
    };
  }

  private _emit(event: SessionChangeEvent): void {
    this.listeners.forEach((cb) => cb(event));
  }
}

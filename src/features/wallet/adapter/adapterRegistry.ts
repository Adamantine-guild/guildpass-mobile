/**
 * AdapterRegistry — factory and registry for WalletAdapter implementations.
 *
 * Responsibilities
 * ----------------
 * 1. Store a map of `WalletAdapterType → factory function`.
 * 2. Allow new providers to be registered at runtime without touching existing code.
 * 3. Expose a `create()` method that returns a `WalletAdapter` given a type + options.
 * 4. Maintain a reference to the currently active adapter so that `useWallet` can
 *    always delegate to the right provider without re-instantiation.
 *
 * Adding a new provider
 * ---------------------
 * 1. Implement `WalletAdapter` (see walletAdapter.interface.ts).
 * 2. Call `adapterRegistry.register("myprovider", (opts) => new MyProviderAdapter(opts))`.
 * 3. That's it — no changes to useWallet, screens, or any other consuming code.
 */

import {
  WalletAdapter,
  WalletAdapterType,
  WalletAdapterError,
} from "./walletAdapter.interface";
import { ManualAdapter } from "./manual.adapter";
import { MockAdapter } from "./mock.adapter";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AdapterFactory = (options?: any) => WalletAdapter;

class AdapterRegistry {
  private factories = new Map<string, AdapterFactory>();
  private _active: WalletAdapter | null = null;

  constructor() {
    // Register built-in adapters. Third-party SDK adapters (WalletConnect,
    // MetaMask, Coinbase) are NOT registered here because their constructors
    // require live SDK instances which are only available at runtime.
    // Call `registry.register(...)` in your app bootstrap (e.g. app/_layout.tsx)
    // after initialising those SDKs.
    this.register("manual", (opts?: { address?: string }) =>
      new ManualAdapter(opts?.address)
    );
    this.register("mock", (opts?: { address?: string | null }) =>
      new MockAdapter(opts?.address ?? null)
    );
  }

  /**
   * Register a factory for `type`. Safe to call multiple times — the most
   * recently registered factory wins.
   */
  register(type: string, factory: AdapterFactory): void {
    this.factories.set(type, factory);
  }

  /**
   * Return `true` if a factory is registered for `type`.
   */
  isRegistered(type: string): boolean {
    return this.factories.has(type);
  }

  /**
   * List all currently registered adapter types.
   */
  registeredTypes(): string[] {
    return Array.from(this.factories.keys());
  }

  /**
   * Create and return a new adapter of `type` without making it the active
   * adapter. Throws `PROVIDER_NOT_FOUND` if the type is not registered.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  create(type: WalletAdapterType | string, options?: any): WalletAdapter {
    const factory = this.factories.get(type);
    if (!factory) {
      throw new WalletAdapterError(
        `No adapter registered for type "${type}". ` +
          `Registered types: ${this.registeredTypes().join(", ")}. ` +
          `Call adapterRegistry.register("${type}", factory) before using this type.`,
        "PROVIDER_NOT_FOUND"
      );
    }
    return factory(options);
  }

  /**
   * Create a new adapter of `type`, set it as the active adapter, and return it.
   * The previous active adapter is NOT automatically disconnected — call
   * `activeAdapter?.disconnect()` yourself if needed.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  activate(type: WalletAdapterType | string, options?: any): WalletAdapter {
    const adapter = this.create(type, options);
    this._active = adapter;
    return adapter;
  }

  /**
   * Get the currently active adapter, or `null` if none has been activated.
   */
  get activeAdapter(): WalletAdapter | null {
    return this._active;
  }

  /**
   * Explicitly set an already-constructed adapter as the active one.
   * Useful when the adapter was created externally (e.g. WalletConnect modal).
   */
  setActive(adapter: WalletAdapter): void {
    this._active = adapter;
  }

  /**
   * Clear the active adapter reference (does NOT call `disconnect()`).
   */
  clearActive(): void {
    this._active = null;
  }
}

/**
 * Singleton registry — import this anywhere in the app.
 *
 * @example
 * // In app/_layout.tsx, after initialising the WalletConnect modal:
 * import { adapterRegistry } from "@/features/wallet/adapter/adapterRegistry";
 * import { WalletConnectAdapter } from "@/features/wallet/adapter/walletConnect.adapter";
 * adapterRegistry.register("walletconnect", () => new WalletConnectAdapter(modal));
 */
export const adapterRegistry = new AdapterRegistry();

// Re-export for convenience so consumers only need one import.
export { AdapterRegistry };

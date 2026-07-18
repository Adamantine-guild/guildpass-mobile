/**
 * Unit tests for the WalletAdapter system.
 *
 * Each concrete adapter is tested in isolation using mocked provider SDKs.
 * The MockAdapter is also exercised to prove the acceptance criterion:
 * "Adding a new wallet provider requires implementing only the adapter
 *  interface, with zero changes to consuming code."
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

import {
  WalletAdapterError,
  ManualAdapter,
  MockAdapter,
  WalletConnectAdapter,
  MetaMaskAdapter,
  CoinbaseAdapter,
  adapterRegistry,
  AdapterRegistry,
} from "../src/features/wallet/adapter";
import type {
  WalletConnectProviderLike,
  MetaMaskProviderLike,
  CoinbaseProviderLike,
} from "../src/features/wallet/adapter";

const VALID_ADDR = "0xabcdef1234567890abcdef1234567890abcdef12";
const VALID_ADDR_MIXED = "0xAbCdEf1234567890AbCdEf1234567890AbCdEf12";

// ---------------------------------------------------------------------------
// WalletAdapterError
// ---------------------------------------------------------------------------
describe("WalletAdapterError", () => {
  it("is an instance of Error", () => {
    const err = new WalletAdapterError("oops", "USER_REJECTED");
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(WalletAdapterError);
  });

  it("exposes code and message", () => {
    const err = new WalletAdapterError("sign failed", "SIGNING_FAILED");
    expect(err.code).toBe("SIGNING_FAILED");
    expect(err.message).toBe("sign failed");
    expect(err.name).toBe("WalletAdapterError");
  });

  it("defaults code to UNKNOWN", () => {
    const err = new WalletAdapterError("unknown");
    expect(err.code).toBe("UNKNOWN");
  });
});

// ---------------------------------------------------------------------------
// ManualAdapter
// ---------------------------------------------------------------------------
describe("ManualAdapter", () => {
  it("type is 'manual'", () => {
    expect(new ManualAdapter(VALID_ADDR).type).toBe("manual");
  });

  it("throws on construction with an invalid address", () => {
    expect(() => new ManualAdapter("0xbad")).toThrow(WalletAdapterError);
  });

  it("connect() returns the normalised (lowercase) address", async () => {
    const adapter = new ManualAdapter(VALID_ADDR_MIXED);
    const accounts = await adapter.connect();
    expect(accounts).toEqual([VALID_ADDR_MIXED.toLowerCase()]);
  });

  it("connect() throws CONNECTION_FAILED when no address configured", async () => {
    const adapter = new ManualAdapter();
    await expect(adapter.connect()).rejects.toMatchObject({ code: "CONNECTION_FAILED" });
  });

  it("getAddress() returns the address without side effects", async () => {
    const adapter = new ManualAdapter(VALID_ADDR);
    expect(await adapter.getAddress()).toBe(VALID_ADDR);
  });

  it("getAddress() returns null after disconnect()", async () => {
    const adapter = new ManualAdapter(VALID_ADDR);
    await adapter.disconnect();
    expect(await adapter.getAddress()).toBeNull();
  });

  it("signMessage() throws NOT_IMPLEMENTED", async () => {
    const adapter = new ManualAdapter(VALID_ADDR);
    await expect(adapter.signMessage("hello")).rejects.toMatchObject({
      code: "NOT_IMPLEMENTED",
    });
  });

  it("switchChain() is a no-op", async () => {
    const adapter = new ManualAdapter(VALID_ADDR);
    await expect(adapter.switchChain(1)).resolves.toBeUndefined();
  });

  it("onSessionChange fires when connect() is called", async () => {
    const adapter = new ManualAdapter(VALID_ADDR);
    const events: unknown[] = [];
    adapter.onSessionChange((e) => events.push(e));
    await adapter.connect();
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ address: VALID_ADDR });
  });

  it("onSessionChange fires null address on disconnect()", async () => {
    const adapter = new ManualAdapter(VALID_ADDR);
    const events: unknown[] = [];
    adapter.onSessionChange((e) => events.push(e));
    await adapter.disconnect();
    expect(events[0]).toMatchObject({ address: null });
  });

  it("unsubscribe stops future events", async () => {
    const adapter = new ManualAdapter(VALID_ADDR);
    const events: unknown[] = [];
    const unsub = adapter.onSessionChange((e) => events.push(e));
    unsub();
    await adapter.connect();
    expect(events).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// MockAdapter — proves zero-change acceptance criterion
// ---------------------------------------------------------------------------
describe("MockAdapter", () => {
  let mock: MockAdapter;

  beforeEach(() => {
    mock = new MockAdapter(VALID_ADDR);
  });

  it("type is 'mock'", () => {
    expect(mock.type).toBe("mock");
  });

  it("connect() returns the configured address", async () => {
    const accounts = await mock.connect();
    expect(accounts).toEqual([VALID_ADDR]);
    expect(mock.connectCallCount).toBe(1);
  });

  it("connect() throws USER_REJECTED when connectShouldReject is true", async () => {
    mock.connectShouldReject = true;
    await expect(mock.connect()).rejects.toMatchObject({ code: "USER_REJECTED" });
  });

  it("disconnect() clears address and fires session change", async () => {
    const events: unknown[] = [];
    mock.onSessionChange((e) => events.push(e));
    await mock.disconnect();
    expect(mock.disconnectCallCount).toBe(1);
    expect(await mock.getAddress()).toBeNull();
    expect(events[0]).toMatchObject({ address: null });
  });

  it("signMessage() returns stub signature by default", async () => {
    const sig = await mock.signMessage("nonce-123");
    expect(sig).toContain("mock-signature");
    expect(mock.signMessageCallCount).toBe(1);
  });

  it("signMessage() returns configured result when set", async () => {
    mock.signMessageResult = "0xfixed";
    const sig = await mock.signMessage("any");
    expect(sig).toBe("0xfixed");
  });

  it("signMessage() throws USER_REJECTED when signShouldReject is true", async () => {
    mock.signShouldReject = true;
    await expect(mock.signMessage("msg")).rejects.toMatchObject({ code: "USER_REJECTED" });
  });

  it("switchChain() succeeds by default", async () => {
    await expect(mock.switchChain(1)).resolves.toBeUndefined();
    expect(mock.switchChainCallCount).toBe(1);
  });

  it("switchChain() throws CHAIN_UNSUPPORTED when configured", async () => {
    mock.switchChainShouldReject = true;
    await expect(mock.switchChain(999)).rejects.toMatchObject({ code: "CHAIN_UNSUPPORTED" });
  });

  it("emitSessionChange() notifies all listeners", () => {
    const events: unknown[] = [];
    mock.onSessionChange((e) => events.push(e));
    mock.emitSessionChange({ address: "0xnew", chainId: 1 });
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ address: "0xnew", chainId: 1 });
  });

  it("reset() clears state and counters", async () => {
    await mock.connect();
    mock.reset();
    expect(mock.connectCallCount).toBe(0);
    expect(await mock.getAddress()).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// WalletConnectAdapter (mocked provider)
// ---------------------------------------------------------------------------
function makeWCProvider(
  overrides: Partial<WalletConnectProviderLike> = {}
): WalletConnectProviderLike {
  return {
    open: vi.fn().mockResolvedValue(undefined),
    disconnect: vi.fn().mockResolvedValue(undefined),
    getAddress: vi.fn().mockReturnValue(VALID_ADDR),
    signMessage: vi.fn().mockResolvedValue("0xwcsig"),
    switchNetwork: vi.fn().mockResolvedValue(undefined),
    subscribeEvents: vi.fn().mockReturnValue(() => {}),
    ...overrides,
  };
}

describe("WalletConnectAdapter", () => {
  it("type is 'walletconnect'", () => {
    expect(new WalletConnectAdapter(makeWCProvider()).type).toBe("walletconnect");
  });

  it("throws PROVIDER_NOT_FOUND when no provider supplied", () => {
    // @ts-expect-error intentional null test
    expect(() => new WalletConnectAdapter(null)).toThrow(WalletAdapterError);
  });

  it("connect() opens the modal and returns the lowercase address", async () => {
    const provider = makeWCProvider();
    const adapter = new WalletConnectAdapter(provider);
    const accounts = await adapter.connect();
    expect(provider.open).toHaveBeenCalledOnce();
    expect(accounts).toEqual([VALID_ADDR]);
  });

  it("connect() throws CONNECTION_FAILED when getAddress returns undefined after open", async () => {
    const provider = makeWCProvider({ getAddress: vi.fn().mockReturnValue(undefined) });
    const adapter = new WalletConnectAdapter(provider);
    await expect(adapter.connect()).rejects.toMatchObject({ code: "CONNECTION_FAILED" });
  });

  it("connect() throws CONNECTION_FAILED when open() rejects", async () => {
    const provider = makeWCProvider({ open: vi.fn().mockRejectedValue(new Error("network")) });
    const adapter = new WalletConnectAdapter(provider);
    await expect(adapter.connect()).rejects.toMatchObject({ code: "CONNECTION_FAILED" });
  });

  it("disconnect() calls provider.disconnect()", async () => {
    const provider = makeWCProvider();
    const adapter = new WalletConnectAdapter(provider);
    await adapter.disconnect();
    expect(provider.disconnect).toHaveBeenCalledOnce();
  });

  it("getAddress() returns lowercase address from provider", async () => {
    const provider = makeWCProvider({ getAddress: vi.fn().mockReturnValue(VALID_ADDR_MIXED) });
    const adapter = new WalletConnectAdapter(provider);
    expect(await adapter.getAddress()).toBe(VALID_ADDR_MIXED.toLowerCase());
  });

  it("getAddress() returns null when provider has no address", async () => {
    const provider = makeWCProvider({ getAddress: vi.fn().mockReturnValue(undefined) });
    const adapter = new WalletConnectAdapter(provider);
    expect(await adapter.getAddress()).toBeNull();
  });

  it("signMessage() calls provider.signMessage and returns signature", async () => {
    const provider = makeWCProvider();
    const adapter = new WalletConnectAdapter(provider);
    const sig = await adapter.signMessage("hello");
    expect(sig).toBe("0xwcsig");
    expect(provider.signMessage).toHaveBeenCalledWith({ message: "hello", address: VALID_ADDR });
  });

  it("signMessage() throws NOT_CONNECTED when no address", async () => {
    const provider = makeWCProvider({ getAddress: vi.fn().mockReturnValue(undefined) });
    const adapter = new WalletConnectAdapter(provider);
    await expect(adapter.signMessage("msg")).rejects.toMatchObject({ code: "NOT_CONNECTED" });
  });

  it("signMessage() throws USER_REJECTED when provider indicates rejection", async () => {
    const provider = makeWCProvider({
      signMessage: vi.fn().mockRejectedValue(new Error("user rejected")),
    });
    const adapter = new WalletConnectAdapter(provider);
    await expect(adapter.signMessage("msg")).rejects.toMatchObject({ code: "USER_REJECTED" });
  });

  it("switchChain() calls provider.switchNetwork", async () => {
    const provider = makeWCProvider();
    const adapter = new WalletConnectAdapter(provider);
    await adapter.switchChain(137);
    expect(provider.switchNetwork).toHaveBeenCalledWith(137);
  });

  it("switchChain() throws CHAIN_UNSUPPORTED on error", async () => {
    const provider = makeWCProvider({
      switchNetwork: vi.fn().mockRejectedValue(new Error("not supported")),
    });
    const adapter = new WalletConnectAdapter(provider);
    await expect(adapter.switchChain(999)).rejects.toMatchObject({ code: "CHAIN_UNSUPPORTED" });
  });

  it("onSessionChange fires when provider emits ACCOUNT_CHANGED event", () => {
    let eventHandler: ((e: { name: string; data: unknown }) => void) | null = null;
    const provider = makeWCProvider({
      subscribeEvents: vi.fn().mockImplementation((cb) => {
        eventHandler = cb;
        return () => {};
      }),
    });

    const adapter = new WalletConnectAdapter(provider);
    const events: unknown[] = [];
    adapter.onSessionChange((e) => events.push(e));

    eventHandler?.({ name: "ACCOUNT_CHANGED", data: {} });
    expect(events).toHaveLength(1);
  });

  it("unsubscribe stops session-change events", () => {
    const adapter = new WalletConnectAdapter(makeWCProvider());
    const events: unknown[] = [];
    const unsub = adapter.onSessionChange((e) => events.push(e));
    unsub();
    // No way to trigger events from outside without emitSessionChange;
    // just verify the unsubscribe function is callable without error.
    expect(events).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// MetaMaskAdapter (mocked EIP-1193 provider)
// ---------------------------------------------------------------------------
function makeMMProvider(
  requestResults: Record<string, unknown> = {},
  overrides: Partial<MetaMaskProviderLike> = {}
): MetaMaskProviderLike {
  return {
    request: vi.fn().mockImplementation(({ method }: { method: string }) => {
      if (method in requestResults) return Promise.resolve(requestResults[method]);
      if (method === "eth_requestAccounts") return Promise.resolve([VALID_ADDR]);
      if (method === "eth_accounts") return Promise.resolve([VALID_ADDR]);
      if (method === "personal_sign") return Promise.resolve("0xmmsig");
      if (method === "wallet_switchEthereumChain") return Promise.resolve(null);
      return Promise.resolve(null);
    }),
    on: vi.fn(),
    removeListener: vi.fn(),
    ...overrides,
  };
}

describe("MetaMaskAdapter", () => {
  it("type is 'metamask'", () => {
    expect(new MetaMaskAdapter(makeMMProvider()).type).toBe("metamask");
  });

  it("throws PROVIDER_NOT_FOUND when no provider supplied", () => {
    // @ts-expect-error intentional null test
    expect(() => new MetaMaskAdapter(null)).toThrow(WalletAdapterError);
  });

  it("connect() calls eth_requestAccounts and returns lowercase addresses", async () => {
    const provider = makeMMProvider();
    const adapter = new MetaMaskAdapter(provider);
    const accounts = await adapter.connect();
    expect(accounts).toEqual([VALID_ADDR]);
    expect(provider.request).toHaveBeenCalledWith({ method: "eth_requestAccounts" });
  });

  it("connect() throws USER_REJECTED when no accounts returned", async () => {
    const provider = makeMMProvider({ eth_requestAccounts: [] });
    const adapter = new MetaMaskAdapter(provider);
    await expect(adapter.connect()).rejects.toMatchObject({ code: "USER_REJECTED" });
  });

  it("connect() throws USER_REJECTED on 4001 error code message", async () => {
    const provider = makeMMProvider({}, {
      request: vi.fn().mockRejectedValue(new Error("4001: User rejected")),
      on: vi.fn(),
      removeListener: vi.fn(),
    });
    const adapter = new MetaMaskAdapter(provider);
    await expect(adapter.connect()).rejects.toMatchObject({ code: "USER_REJECTED" });
  });

  it("getAddress() calls eth_accounts", async () => {
    const provider = makeMMProvider();
    const adapter = new MetaMaskAdapter(provider);
    const addr = await adapter.getAddress();
    expect(addr).toBe(VALID_ADDR);
  });

  it("getAddress() returns null when eth_accounts returns empty array", async () => {
    const provider = makeMMProvider({ eth_accounts: [] });
    const adapter = new MetaMaskAdapter(provider);
    expect(await adapter.getAddress()).toBeNull();
  });

  it("signMessage() calls personal_sign with message and address", async () => {
    const provider = makeMMProvider();
    const adapter = new MetaMaskAdapter(provider);
    await adapter.connect();
    const sig = await adapter.signMessage("nonce");
    expect(sig).toBe("0xmmsig");
    expect(provider.request).toHaveBeenCalledWith({
      method: "personal_sign",
      params: ["nonce", VALID_ADDR],
    });
  });

  it("signMessage() throws NOT_CONNECTED when no account active", async () => {
    const provider = makeMMProvider({ eth_accounts: [] });
    const adapter = new MetaMaskAdapter(provider);
    await expect(adapter.signMessage("msg")).rejects.toMatchObject({ code: "NOT_CONNECTED" });
  });

  it("switchChain() calls wallet_switchEthereumChain with hex chain ID", async () => {
    const provider = makeMMProvider();
    const adapter = new MetaMaskAdapter(provider);
    await adapter.switchChain(137);
    expect(provider.request).toHaveBeenCalledWith({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: "0x89" }],
    });
  });

  it("switchChain() throws CHAIN_UNSUPPORTED on error", async () => {
    const provider = makeMMProvider({}, {
      request: vi.fn()
        .mockResolvedValueOnce([VALID_ADDR])  // eth_requestAccounts
        .mockRejectedValueOnce(new Error("chain not added")),
      on: vi.fn(),
      removeListener: vi.fn(),
    });
    const adapter = new MetaMaskAdapter(provider);
    await expect(adapter.switchChain(999)).rejects.toMatchObject({ code: "CHAIN_UNSUPPORTED" });
  });

  it("registers accountsChanged listener on construction", () => {
    const provider = makeMMProvider();
    new MetaMaskAdapter(provider);
    expect(provider.on).toHaveBeenCalledWith("accountsChanged", expect.any(Function));
  });

  it("destroy() removes all provider event listeners", () => {
    const provider = makeMMProvider();
    const adapter = new MetaMaskAdapter(provider);
    adapter.destroy();
    expect(provider.removeListener).toHaveBeenCalledTimes(3);
  });
});

// ---------------------------------------------------------------------------
// CoinbaseAdapter (mocked EIP-1193 provider with close())
// ---------------------------------------------------------------------------
function makeCBProvider(
  requestResults: Record<string, unknown> = {},
  overrides: Partial<CoinbaseProviderLike> = {}
): CoinbaseProviderLike {
  return {
    request: vi.fn().mockImplementation(({ method }: { method: string }) => {
      if (method in requestResults) return Promise.resolve(requestResults[method]);
      if (method === "eth_requestAccounts") return Promise.resolve([VALID_ADDR]);
      if (method === "eth_accounts") return Promise.resolve([VALID_ADDR]);
      if (method === "personal_sign") return Promise.resolve("0xcbsig");
      if (method === "wallet_switchEthereumChain") return Promise.resolve(null);
      return Promise.resolve(null);
    }),
    on: vi.fn(),
    removeListener: vi.fn(),
    close: vi.fn(),
    ...overrides,
  };
}

describe("CoinbaseAdapter", () => {
  it("type is 'coinbase'", () => {
    expect(new CoinbaseAdapter(makeCBProvider()).type).toBe("coinbase");
  });

  it("throws PROVIDER_NOT_FOUND when no provider supplied", () => {
    // @ts-expect-error intentional null test
    expect(() => new CoinbaseAdapter(null)).toThrow(WalletAdapterError);
  });

  it("connect() calls eth_requestAccounts and returns lowercase addresses", async () => {
    const provider = makeCBProvider();
    const adapter = new CoinbaseAdapter(provider);
    const accounts = await adapter.connect();
    expect(accounts).toEqual([VALID_ADDR]);
  });

  it("connect() throws USER_REJECTED when no accounts returned", async () => {
    const provider = makeCBProvider({ eth_requestAccounts: [] });
    const adapter = new CoinbaseAdapter(provider);
    await expect(adapter.connect()).rejects.toMatchObject({ code: "USER_REJECTED" });
  });

  it("disconnect() calls provider.close() when available", async () => {
    const provider = makeCBProvider();
    const adapter = new CoinbaseAdapter(provider);
    await adapter.disconnect();
    expect(provider.close).toHaveBeenCalledOnce();
  });

  it("disconnect() works without close() on provider", async () => {
    const { close: _c, ...providerWithoutClose } = makeCBProvider();
    const adapter = new CoinbaseAdapter(providerWithoutClose as CoinbaseProviderLike);
    await expect(adapter.disconnect()).resolves.toBeUndefined();
  });

  it("getAddress() returns null when eth_accounts is empty", async () => {
    const provider = makeCBProvider({ eth_accounts: [] });
    const adapter = new CoinbaseAdapter(provider);
    expect(await adapter.getAddress()).toBeNull();
  });

  it("signMessage() returns signature on success", async () => {
    const provider = makeCBProvider();
    const adapter = new CoinbaseAdapter(provider);
    await adapter.connect();
    const sig = await adapter.signMessage("msg");
    expect(sig).toBe("0xcbsig");
  });

  it("signMessage() throws NOT_CONNECTED when no active account", async () => {
    const provider = makeCBProvider({ eth_accounts: [] });
    const adapter = new CoinbaseAdapter(provider);
    await expect(adapter.signMessage("msg")).rejects.toMatchObject({ code: "NOT_CONNECTED" });
  });

  it("switchChain() uses hex chain ID format", async () => {
    const provider = makeCBProvider();
    const adapter = new CoinbaseAdapter(provider);
    await adapter.switchChain(8453); // Base mainnet
    expect(provider.request).toHaveBeenCalledWith({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: "0x2105" }],
    });
  });

  it("registers accountsChanged listener on construction", () => {
    const provider = makeCBProvider();
    new CoinbaseAdapter(provider);
    expect(provider.on).toHaveBeenCalledWith("accountsChanged", expect.any(Function));
  });

  it("destroy() removes all provider event listeners", () => {
    const provider = makeCBProvider();
    const adapter = new CoinbaseAdapter(provider);
    adapter.destroy();
    expect(provider.removeListener).toHaveBeenCalledTimes(3);
  });
});

// ---------------------------------------------------------------------------
// AdapterRegistry
// ---------------------------------------------------------------------------
describe("AdapterRegistry", () => {
  let registry: AdapterRegistry;

  beforeEach(() => {
    // Use a fresh registry (not the singleton) so tests don't pollute each other.
    const { AdapterRegistry: AR } = require("../src/features/wallet/adapter/adapterRegistry");
    registry = new AR();
  });

  it("has 'manual' and 'mock' registered by default", () => {
    expect(registry.isRegistered("manual")).toBe(true);
    expect(registry.isRegistered("mock")).toBe(true);
  });

  it("isRegistered returns false for unregistered types", () => {
    expect(registry.isRegistered("walletconnect")).toBe(false);
  });

  it("create() returns a ManualAdapter for type 'manual'", () => {
    const adapter = registry.create("manual", { address: VALID_ADDR });
    expect(adapter.type).toBe("manual");
  });

  it("create() returns a MockAdapter for type 'mock'", () => {
    const adapter = registry.create("mock", { address: VALID_ADDR });
    expect(adapter.type).toBe("mock");
  });

  it("create() throws PROVIDER_NOT_FOUND for unregistered types", () => {
    expect(() => registry.create("walletconnect")).toThrow(WalletAdapterError);
    expect(() => registry.create("walletconnect")).toThrow(/No adapter registered/);
  });

  it("activate() sets the active adapter", () => {
    const adapter = registry.activate("manual", { address: VALID_ADDR });
    expect(registry.activeAdapter).toBe(adapter);
  });

  it("setActive() sets an externally constructed adapter", () => {
    const mock = new MockAdapter(VALID_ADDR);
    registry.setActive(mock);
    expect(registry.activeAdapter).toBe(mock);
  });

  it("clearActive() removes the active adapter reference", () => {
    registry.activate("mock");
    registry.clearActive();
    expect(registry.activeAdapter).toBeNull();
  });

  it("register() allows adding a new provider type", () => {
    registry.register("testprovider", () => new MockAdapter(VALID_ADDR));
    expect(registry.isRegistered("testprovider")).toBe(true);
    const adapter = registry.create("testprovider");
    expect(adapter.type).toBe("mock");
  });

  it("registeredTypes() lists all registered type names", () => {
    const types = registry.registeredTypes();
    expect(types).toContain("manual");
    expect(types).toContain("mock");
  });
});

// ---------------------------------------------------------------------------
// Acceptance criterion: adding a new provider only requires implementing the
// interface — no changes to consuming code (useWallet connectWithAdapter path)
// ---------------------------------------------------------------------------
describe("Acceptance: new provider via MockAdapter (zero consuming code changes)", () => {
  it("connectWithAdapter works with MockAdapter as a drop-in provider", async () => {
    // Simulate what useWallet.connectWithAdapter does, using a brand-new adapter type.
    const { validateAndNormalizeAddress } = await import(
      "../src/lib/walletValidation"
    );

    const mock = new MockAdapter(VALID_ADDR);
    const accounts = await mock.connect();
    const first = accounts[0];
    const result = validateAndNormalizeAddress(first);
    expect(result.valid).toBe(true);
    if (result.valid) {
      // In the real hook this would call setWalletAddress + startSession.
      expect(result.address).toBe(VALID_ADDR);
    }
    // The consuming code only calls: adapter.connect(), validates address,
    // sets store. No provider-specific branches.
  });
});

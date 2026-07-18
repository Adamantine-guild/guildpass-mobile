# Wallet Adapter Architecture

## Overview

The wallet adapter layer provides a single, provider-agnostic abstraction between the app's UI/feature code and the concrete wallet SDKs (WalletConnect, MetaMask, Coinbase Wallet, or manual address entry). All consuming code — hooks, screens, session management — only ever references the `WalletAdapter` interface. Adding a new wallet provider requires implementing that interface and registering a factory; no other files change.

---

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                     UI / Feature Layer                       │
│                                                             │
│  app/profile.tsx   app/access-check.tsx   app/guilds/...   │
│         │                   │                               │
│         └──────────┬────────┘                               │
│                    ▼                                        │
│              useWallet (hook)                               │
│   connectManually()  connectWithAdapter()  disconnect()     │
└────────────────────┬────────────────────────────────────────┘
                     │  WalletAdapter (interface only)
                     ▼
┌─────────────────────────────────────────────────────────────┐
│                   Adapter Layer                              │
│                                                             │
│  ┌──────────────┐  ┌──────────────────┐  ┌─────────────┐  │
│  │ ManualAdapter│  │WalletConnectAdapt│  │MetaMaskAdapt│  │
│  │ (built-in)   │  │(WC v2 / AppKit)  │  │(EIP-1193 DL)│  │
│  └──────────────┘  └──────────────────┘  └─────────────┘  │
│  ┌──────────────┐  ┌──────────────────┐                    │
│  │CoinbaseAdapt │  │  MockAdapter     │  ← any future      │
│  │(@coinbase/wb)│  │(tests / preview) │    provider here   │
│  └──────────────┘  └──────────────────┘                    │
│                                                             │
│  All implement: WalletAdapter interface                     │
│    connect()  disconnect()  getAddress()                    │
│    signMessage()  switchChain()  onSessionChange()          │
└──────────────────────┬──────────────────────────────────────┘
                       │  factory lookup
                       ▼
┌─────────────────────────────────────────────────────────────┐
│                  AdapterRegistry (singleton)                 │
│                                                             │
│  register(type, factory)   create(type, options)            │
│  activate(type, options)   activeAdapter                    │
│                                                             │
│  Built-in: "manual", "mock"                                 │
│  Register at boot: "walletconnect", "metamask", "coinbase"  │
└─────────────────────────────────────────────────────────────┘
                       │  delegates to
                       ▼
┌─────────────────────────────────────────────────────────────┐
│              Existing Infrastructure (unchanged)            │
│                                                             │
│  wallet.store (Zustand)  →  persists address                │
│  session.store (Zustand) →  token lifecycle                 │
│  walletScopedCache       →  React Query cache eviction      │
└─────────────────────────────────────────────────────────────┘
```

---

## WalletAdapter Interface

Defined in `src/features/wallet/adapter/walletAdapter.interface.ts`.

```typescript
interface WalletAdapter {
  readonly type: WalletAdapterType;           // "manual" | "walletconnect" | "metamask" | "coinbase" | "mock"
  connect(): Promise<string[]>;               // open provider UI; return granted accounts
  disconnect(): Promise<void>;               // tear down session
  getAddress(): Promise<string | null>;      // current address, no UI trigger
  signMessage(message: string): Promise<string>; // personal_sign
  switchChain(chainId: number): Promise<void>;   // wallet_switchEthereumChain
  onSessionChange(cb: SessionChangeCallback): UnsubscribeFn; // account/chain/disconnect events
}
```

All errors are thrown as `WalletAdapterError` with a typed `code` (`USER_REJECTED`, `NOT_CONNECTED`, `CHAIN_UNSUPPORTED`, `PROVIDER_NOT_FOUND`, `SIGNING_FAILED`, `CONNECTION_FAILED`, `NOT_IMPLEMENTED`, `UNKNOWN`). Consuming code never inspects vendor-specific error shapes.

---

## Concrete Implementations

| File | Type | SDK dependency | Notes |
|------|------|---------------|-------|
| `manual.adapter.ts` | `"manual"` | none | wraps a pre-validated address; `signMessage` throws `NOT_IMPLEMENTED` |
| `walletConnect.adapter.ts` | `"walletconnect"` | `WalletConnectProviderLike` (duck-type) | accepts `@reown/appkit-react-native` or any WC v2 modal |
| `metaMask.adapter.ts` | `"metamask"` | `MetaMaskProviderLike` (EIP-1193 duck-type) | works with `@metamask/sdk-react-native` |
| `coinbase.adapter.ts` | `"coinbase"` | `CoinbaseProviderLike` (EIP-1193 + `close()`) | works with `@coinbase/wallet-sdk` |
| `mock.adapter.ts` | `"mock"` | none | fully controllable; used in tests and demos |

Each SDK-backed adapter accepts a duck-typed provider interface in its constructor. This means:
- Tests can inject a plain object mock — no real SDK needed.
- The app can swap SDK versions (e.g. WC v2 → v3) by updating only the adapter constructor call, not the adapter file.

---

## AdapterRegistry

`src/features/wallet/adapter/adapterRegistry.ts` exports a singleton `adapterRegistry`.

### Registering SDK-backed providers (do this at app boot)

```typescript
// app/_layout.tsx — after initialising each SDK:
import { adapterRegistry } from "@/features/wallet/adapter";
import { WalletConnectAdapter } from "@/features/wallet/adapter";
import { MetaMaskAdapter } from "@/features/wallet/adapter";
import { CoinbaseAdapter } from "@/features/wallet/adapter";

// WalletConnect (AppKit / WC v2):
const modal = createAppKit({ projectId, networks });
adapterRegistry.register("walletconnect", () => new WalletConnectAdapter(modal));

// MetaMask SDK:
const { provider } = await MetaMaskSDK.init({ ... });
adapterRegistry.register("metamask", () => new MetaMaskAdapter(provider));

// Coinbase Wallet:
const cb = new CoinbaseWalletSDK({ appName: "GuildPass" });
const cbProvider = cb.makeWeb3Provider();
adapterRegistry.register("coinbase", () => new CoinbaseAdapter(cbProvider));
```

### Using an adapter from the registry

```typescript
// activate() creates, stores as active, and returns the adapter
const adapter = adapterRegistry.activate("walletconnect");
const { success, error } = await connectWithAdapter(adapter);
```

---

## Using `connectWithAdapter` in the UI

`useWallet` exposes `connectWithAdapter(adapter)` alongside the existing `connectManually` and `connectWithConnector` paths. The UI does not need to know which provider is active:

```typescript
const { connectWithAdapter } = useWallet();

// WalletConnect button press:
const adapter = adapterRegistry.activate("walletconnect");
const result = await connectWithAdapter(adapter);
if (!result.success) showError(result.error);

// MetaMask button press:
const adapter = adapterRegistry.activate("metamask");
const result = await connectWithAdapter(adapter);
```

The rest of the app (guilds, access-check, membership) reads `walletAddress` from the store and is completely unaware of which provider supplied it.

---

## Adding a New Provider

1. Create `src/features/wallet/adapter/myProvider.adapter.ts` implementing `WalletAdapter`.
2. Export it from `src/features/wallet/adapter/index.ts`.
3. Register a factory in app bootstrap: `adapterRegistry.register("myprovider", () => new MyProviderAdapter(sdk))`.
4. Done. **Zero changes** to `useWallet`, screens, session store, or access-check logic.

---

## File Layout

```
src/features/wallet/
├── adapter/
│   ├── walletAdapter.interface.ts  ← WalletAdapter, WalletAdapterError, types
│   ├── manual.adapter.ts
│   ├── walletConnect.adapter.ts
│   ├── metaMask.adapter.ts
│   ├── coinbase.adapter.ts
│   ├── mock.adapter.ts             ← for tests / MockAdapter demo
│   ├── adapterRegistry.ts          ← singleton AdapterRegistry
│   └── index.ts                    ← barrel export
├── useWallet.ts                    ← adds connectWithAdapter(); legacy paths kept
├── wallet.store.ts
├── wallet.types.ts
├── walletConnector.service.ts      ← legacy WalletConnector (kept for compat)
└── walletConnector.types.ts        ← legacy WalletConnector types (kept for compat)

tests/
└── walletAdapter.test.ts           ← unit tests for all adapters + registry
```

---

## Error Handling

```typescript
import { WalletAdapterError } from "@/features/wallet/adapter";

try {
  await connectWithAdapter(adapter);
} catch (e) {
  if (e instanceof WalletAdapterError) {
    switch (e.code) {
      case "USER_REJECTED": /* show "Connection cancelled" */ break;
      case "PROVIDER_NOT_FOUND": /* show "Install MetaMask" */ break;
      case "CHAIN_UNSUPPORTED": /* show "Switch to Base network" */ break;
    }
  }
}
```

`connectWithAdapter` in `useWallet` catches all `WalletAdapterError` throws and surfaces them as `{ success: false, error: string }` — screens never need to import the error class directly.

---

## Migration from WalletConnector

The previous `WalletConnector` interface (`walletConnector.types.ts`) and its factories (`walletConnector.service.ts`) are preserved for backwards compatibility. `connectWithConnector` in `useWallet` still works. New code should use `connectWithAdapter` + the adapter classes instead. The `WalletConnector` interface can be deprecated and removed once all call sites have migrated.

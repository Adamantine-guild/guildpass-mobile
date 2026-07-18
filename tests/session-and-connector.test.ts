import { describe, it, expect, beforeEach, vi } from "vitest";
import { useSessionStore } from "../src/features/session/session.store";
import { SessionAdapter } from "../src/features/session/session.types";
import { noopSessionAdapter } from "../src/features/session/session.adapter";
import { createManualConnector, createWalletConnectConnector, isConnectorTypeSupported } from "../src/features/wallet/walletConnector.service";

const ADDR = "0x1234567890123456789012345678901234567890";

function resetSession() {
  useSessionStore.setState({
    status: "unauthenticated",
    walletAddress: null,
    token: null,
    expiresAt: null,
    adapter: noopSessionAdapter,
  });
}

describe("Session store", () => {
  beforeEach(resetSession);

  it("starts unauthenticated", () => {
    expect(useSessionStore.getState().status).toBe("unauthenticated");
  });

  it("startSession transitions to authenticated via noop adapter", async () => {
    await useSessionStore.getState().startSession(ADDR);
    const { status, walletAddress, token } = useSessionStore.getState();
    expect(status).toBe("authenticated");
    expect(walletAddress).toBe(ADDR);
    expect(token).toMatch(/^noop:/);
  });

  it("startSession transitions to failed when adapter throws", async () => {
    const failingAdapter: SessionAdapter = {
      async signIn() { throw new Error("network error"); },
      async refresh(t) { return { token: t, expiresAt: 0 }; },
      async signOut() {},
    };
    useSessionStore.getState().setAdapter(failingAdapter);
    await useSessionStore.getState().startSession(ADDR);
    expect(useSessionStore.getState().status).toBe("failed");
  });

  it("endSession resets to unauthenticated", async () => {
    await useSessionStore.getState().startSession(ADDR);
    await useSessionStore.getState().endSession();
    const { status, walletAddress, token } = useSessionStore.getState();
    expect(status).toBe("unauthenticated");
    expect(walletAddress).toBeNull();
    expect(token).toBeNull();
  });

  it("refreshSession updates token", async () => {
    const refreshAdapter: SessionAdapter = {
      async signIn() { return { token: "initial", expiresAt: Date.now() + 1000 }; },
      async refresh() { return { token: "refreshed", expiresAt: Date.now() + 2000 }; },
      async signOut() {},
    };
    useSessionStore.getState().setAdapter(refreshAdapter);
    await useSessionStore.getState().startSession(ADDR);
    await useSessionStore.getState().refreshSession();
    expect(useSessionStore.getState().token).toBe("refreshed");
    expect(useSessionStore.getState().status).toBe("authenticated");
  });

  it("refreshSession transitions to expired when adapter throws", async () => {
    const badRefreshAdapter: SessionAdapter = {
      async signIn() { return { token: "tok", expiresAt: Date.now() + 1000 }; },
      async refresh() { throw new Error("expired"); },
      async signOut() {},
    };
    useSessionStore.getState().setAdapter(badRefreshAdapter);
    await useSessionStore.getState().startSession(ADDR);
    await useSessionStore.getState().refreshSession();
    expect(useSessionStore.getState().status).toBe("expired");
  });

  it("restoreSession sets authenticated when token is present and not expired", () => {
    useSessionStore.getState().restoreSession({
      walletAddress: ADDR,
      token: "saved-token",
      expiresAt: Date.now() + 60_000,
    });
    expect(useSessionStore.getState().status).toBe("authenticated");
    expect(useSessionStore.getState().walletAddress).toBe(ADDR);
  });

  it("restoreSession sets unauthenticated when token is expired", () => {
    useSessionStore.getState().restoreSession({
      walletAddress: ADDR,
      token: "old-token",
      expiresAt: Date.now() - 1000,
    });
    expect(useSessionStore.getState().status).toBe("unauthenticated");
  });
});

describe("noopSessionAdapter", () => {
  it("signIn returns a token scoped to the wallet address", async () => {
    const { token, expiresAt } = await noopSessionAdapter.signIn(ADDR);
    expect(token).toContain(ADDR);
    expect(expiresAt).toBeGreaterThan(Date.now());
  });

  it("refresh returns the same token with a new expiry", async () => {
    const { token } = await noopSessionAdapter.refresh("my-token");
    expect(token).toBe("my-token");
  });
});

describe("WalletConnector — manual", () => {
  it("connect returns the address", async () => {
    const connector = createManualConnector(ADDR);
    const accounts = await connector.connect();
    expect(accounts).toEqual([ADDR]);
  });

  it("reconnect returns the address", async () => {
    const accounts = await createManualConnector(ADDR).reconnect();
    expect(accounts).toEqual([ADDR]);
  });

  it("getAccounts returns the address", async () => {
    const accounts = await createManualConnector(ADDR).getAccounts();
    expect(accounts).toEqual([ADDR]);
  });

  it("type is 'manual'", () => {
    expect(createManualConnector(ADDR).type).toBe("manual");
  });
});

describe("WalletConnector — walletconnect", () => {
  const mockProvider = {
    request: async () => ["0x1234567890123456789012345678901234567890"],
    disconnect: async () => {},
  };

  it("connect returns accounts from provider", async () => {
    const connector = createWalletConnectConnector(mockProvider);
    const accounts = await connector.connect();
    expect(accounts).toEqual(["0x1234567890123456789012345678901234567890"]);
  });

  it("isConnectorTypeSupported returns true for walletconnect", () => {
    expect(isConnectorTypeSupported("walletconnect")).toBe(true);
  });

  it("isConnectorTypeSupported returns false for coinbase and metamask (not yet registered)", () => {
    expect(isConnectorTypeSupported("coinbase")).toBe(false);
    expect(isConnectorTypeSupported("metamask")).toBe(false);
  });
});

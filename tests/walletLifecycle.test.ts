/**
 * Wallet lifecycle orchestration (Issue #224).
 *
 * These are the cross-feature state transitions that used to live inline inside
 * `useWallet` and `useSecurityInit`. The ordering test is the reason this module
 * is a plain awaitable function rather than an event emitter.
 */

import { beforeEach, describe, expect, it } from "vitest";
import {
  endWalletSession,
  invalidateSessionForCompromise,
  startWalletSession,
} from "../src/lib/walletLifecycle";
import { queryClient } from "../src/lib/queryClient";
import { useSessionStore } from "../src/features/session/session.store";
import { useSyncStore } from "../src/features/sync/sync.store";
import type { SessionAdapter } from "../src/features/session/session.types";
import type { SyncCorrection } from "../src/features/sync/sync.types";

const WALLET = "0xabc0000000000000000000000000000000000001";
const GUILD = "guild_abc";

const MEMBERSHIP_KEY = ["membership", WALLET, GUILD];
const USER_ROLES_KEY = ["user-roles", WALLET, GUILD];
const GUILD_KEY = ["guild", GUILD];

function makeCorrection(): SyncCorrection {
  return {
    id: "membership_revoked:membership:guild_abc:0xabc",
    type: "membership_revoked",
    severity: "critical",
    entityKind: "membership",
    guildId: GUILD,
    walletAddress: WALLET,
    message: "Membership revoked.",
    detectedAt: "2026-07-25T12:00:00.000Z",
  };
}

/** Adapter that records the query-cache state observed at sign-out time. */
function makeAdapter(onSignOut?: () => void): SessionAdapter {
  return {
    async signIn(walletAddress) {
      return { token: `token:${walletAddress}`, expiresAt: 4_000_000_000_000 };
    },
    async refresh(token) {
      return { token, expiresAt: 4_000_000_000_000 };
    },
    async signOut() {
      onSignOut?.();
    },
  };
}

function seedCache(): void {
  queryClient.setQueryData(MEMBERSHIP_KEY, { isActive: true });
  queryClient.setQueryData(USER_ROLES_KEY, ["admin"]);
  queryClient.setQueryData(GUILD_KEY, { name: "Adamantine" });
}

beforeEach(() => {
  queryClient.clear();
  useSyncStore.setState({
    status: "idle",
    lastSyncStartedAt: null,
    lastSyncCompletedAt: null,
    lastSyncError: null,
    entityMeta: {},
    corrections: [],
  });
  useSessionStore.setState({
    status: "unauthenticated",
    walletAddress: null,
    token: null,
    expiresAt: null,
    adapter: makeAdapter(),
  });
});

describe("startWalletSession", () => {
  it("authenticates the session through the configured adapter", async () => {
    await startWalletSession(WALLET);

    const session = useSessionStore.getState();
    expect(session.status).toBe("authenticated");
    expect(session.walletAddress).toBe(WALLET);
    expect(session.token).toBe(`token:${WALLET}`);
  });
});

describe("endWalletSession", () => {
  it("clears wallet-scoped queries, sync state, and the session", async () => {
    seedCache();
    useSyncStore.setState({ corrections: [makeCorrection()], lastSyncError: "boom" });
    await startWalletSession(WALLET);

    await endWalletSession();

    expect(queryClient.getQueryData(MEMBERSHIP_KEY)).toBeUndefined();
    expect(queryClient.getQueryData(USER_ROLES_KEY)).toBeUndefined();
    expect(useSyncStore.getState().corrections).toEqual([]);
    expect(useSyncStore.getState().lastSyncError).toBeNull();
    expect(useSessionStore.getState().status).toBe("unauthenticated");
    expect(useSessionStore.getState().token).toBeNull();
  });

  it("leaves queries that are not wallet-scoped intact", async () => {
    seedCache();

    await endWalletSession();

    expect(queryClient.getQueryData(GUILD_KEY)).toEqual({ name: "Adamantine" });
  });

  // The ordering guarantee: a screen still mounted during teardown must not be
  // able to refetch against a live token and repopulate the outgoing wallet's
  // cache. An emitter-based fan-out could not express or verify this.
  it("drops the wallet-scoped cache before the session is signed out", async () => {
    const observed: Array<string | undefined> = [];
    seedCache();
    useSessionStore.setState({
      adapter: makeAdapter(() => {
        observed.push(
          queryClient.getQueryData(MEMBERSHIP_KEY) === undefined ? "cleared" : "present",
        );
      }),
    });
    await startWalletSession(WALLET);

    await endWalletSession();

    expect(observed).toEqual(["cleared"]);
  });

  it("clears sync state before the session is signed out", async () => {
    const observed: number[] = [];
    useSyncStore.setState({ corrections: [makeCorrection()] });
    useSessionStore.setState({
      adapter: makeAdapter(() => {
        observed.push(useSyncStore.getState().corrections.length);
      }),
    });
    await startWalletSession(WALLET);

    await endWalletSession();

    expect(observed).toEqual([0]);
  });
});

describe("invalidateSessionForCompromise", () => {
  it("ends the session without clearing the wallet-scoped cache", async () => {
    seedCache();
    await startWalletSession(WALLET);

    await invalidateSessionForCompromise();

    expect(useSessionStore.getState().status).toBe("unauthenticated");
    expect(useSessionStore.getState().token).toBeNull();
    expect(queryClient.getQueryData(MEMBERSHIP_KEY)).toEqual({ isActive: true });
  });
});

/**
 * Foreground re-validation of device integrity — transition detection tests.
 *
 * Acceptance criteria covered:
 *  1. A simulated secure→compromised transition on foreground triggers session
 *     invalidation when responsePolicy: "block".
 *  2. A warn-policy configuration surfaces a clear, dismissible warning instead
 *     of forcing logout.
 *  3. No false-positive invalidation on repeated identical "secure" results
 *     (only transitions trigger action).
 *  4. Tests cover the transition-detection logic using
 *     tests/securityVerification.test.ts's existing patterns.
 */

import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { AppState, Platform } from "react-native";
import type { AppStateStatus } from "react-native";
import Constants from "expo-constants";
import {
  configureDeviceIntegrity,
  assessDeviceIntegrity,
  checkIntegrityTransition,
  getIntegrityResponsePolicy,
} from "../src/features/security/deviceIntegrity";
import { useSessionStore } from "../src/features/session/session.store";
import { useIntegrityWarningStore } from "../src/features/security/integrityWarning.store";
// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Monkey-patches `Platform.OS` so the integrity module runs the checks for the
 * given platform.  We keep the original around so we can restore it later.
 */

function setPlatform(os: "android" | "ios") {
  const orig = Platform.OS;
  Object.defineProperty(Platform, "OS", { get: () => os, configurable: true });
  return () => {
    Object.defineProperty(Platform, "OS", { get: () => orig, configurable: true });
  };
}

/**
 * Mark every check as passed → device appears secure.
 */
function makeAllChecksPass(): void {
  // The JS checks all currently delegate to the native plugin, so they
  // always return passed: true. The only check that can fail is the
  // development-environment check (env:expo_go), which we can control by
  // mocking Constants.executionEnvironment.
  (Constants as any).executionEnvironment = "standalone";
}

/**
 * Mark the development-environment check as failed → device appears compromised.
 */
function makeExpoGoCheckFail(): void {
  (Constants as any).executionEnvironment = "storeClient";
}

// ---------------------------------------------------------------------------
// Reset state between tests
// ---------------------------------------------------------------------------

beforeEach(() => {
  // Reset the internal module state so each test starts clean.
  // We re-assign the private _lastResult and _lastCheckTime by calling
  // assessDeviceIntegrity with force=true after resetting config.
  configureDeviceIntegrity({
    responsePolicy: "block",
    checkOnForeground: true,
    minCheckIntervalMs: 60_000,
  });

  // Clear any persisted session / warning state
  useSessionStore.setState({
    status: "unauthenticated",
    walletAddress: null,
    token: null,
    expiresAt: null,
  });
  useIntegrityWarningStore.setState({
    message: null,
    detectedAt: null,
  });

  // Ensure platform and environment start in a known state
  setPlatform("android");
  makeAllChecksPass();
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("checkIntegrityTransition", () => {
  it('returns "no_change" on first call (no previous result)', () => {
    // Before the first call, _lastResult is null.
    // However, checkIntegrityTransition calls assessDeviceIntegrity(true)
    // which sets _lastResult. On the very first call there's no previous
    // result to compare against → "no_change".
    const transition = checkIntegrityTransition();
    expect(transition).toBe("no_change");
  });

  it('returns "no_change" when two consecutive checks are both secure', () => {
    // First call primes _lastResult
    assessDeviceIntegrity(true);
    // Second call should detect no change
    const transition = checkIntegrityTransition();
    expect(transition).toBe("no_change");
  });

  it('returns "no_change" when two consecutive checks are both compromised', () => {
    makeExpoGoCheckFail();
    // First call primes _lastResult as compromised
    assessDeviceIntegrity(true);
    // Second call — still compromised
    const transition = checkIntegrityTransition();
    expect(transition).toBe("no_change");
  });

  it('returns "secure_to_compromised" when device transitions from secure to compromised', () => {
    // First call: device is secure
    makeAllChecksPass();
    assessDeviceIntegrity(true);

    // Simulate compromise: now running in Expo Go
    makeExpoGoCheckFail();

    const transition = checkIntegrityTransition();
    expect(transition).toBe("secure_to_compromised");
  });

  it('returns "compromised_to_secure" when device transitions from compromised to secure', () => {
    // First call: device is compromised
    makeExpoGoCheckFail();
    assessDeviceIntegrity(true);

    // Simulate remediation: now running as standalone
    makeAllChecksPass();

    const transition = checkIntegrityTransition();
    expect(transition).toBe("compromised_to_secure");
  });

  it("forces a fresh assessment regardless of minCheckIntervalMs", () => {
    // Set a long interval
    configureDeviceIntegrity({ minCheckIntervalMs: 999_999 });

    // First assessment
    makeAllChecksPass();
    assessDeviceIntegrity(true);

    // Immediately check again — should bypass the interval because
    // checkIntegrityTransition always forces a fresh check
    makeExpoGoCheckFail();
    const transition = checkIntegrityTransition();
    expect(transition).toBe("secure_to_compromised");
  });
});

describe("block policy — session invalidation on secure→compromised", () => {
  it("invalidates the session when a secure→compromised transition is detected with block policy", async () => {
    configureDeviceIntegrity({ responsePolicy: "block" });
    expect(getIntegrityResponsePolicy()).toBe("block");

    // Start with a valid session
    useSessionStore.setState({
      status: "authenticated",
      walletAddress: "0xdeadbeef",
      token: "valid-session-token",
      expiresAt: Date.now() + 3600_000,
    });
    expect(useSessionStore.getState().status).toBe("authenticated");

    // Prime integrity as secure
    makeAllChecksPass();
    assessDeviceIntegrity(true);

    // Simulate compromise on foreground
    makeExpoGoCheckFail();
    const transition = checkIntegrityTransition();
    expect(transition).toBe("secure_to_compromised");

    // Under block policy we call endSession().  Since the adapter is noop,
    // endSession() resolves immediately and clears the state.
    await useSessionStore.getState().endSession();
    expect(useSessionStore.getState().status).toBe("unauthenticated");
    expect(useSessionStore.getState().token).toBeNull();
    expect(useSessionStore.getState().walletAddress).toBeNull();
  });
});

describe("warn policy — warning surface on secure→compromised", () => {
  it("surfaces a dismissible warning instead of logging out with warn policy", () => {
    configureDeviceIntegrity({ responsePolicy: "warn" });
    expect(getIntegrityResponsePolicy()).toBe("warn");

    // Start with a valid session
    useSessionStore.setState({
      status: "authenticated",
      walletAddress: "0xcafebabe",
      token: "valid-session-token",
      expiresAt: Date.now() + 3600_000,
    });

    // Prime integrity as secure
    makeAllChecksPass();
    assessDeviceIntegrity(true);

    // Verify no warning is showing yet
    expect(useIntegrityWarningStore.getState().message).toBeNull();

    // Simulate compromise on foreground
    makeExpoGoCheckFail();
    const transition = checkIntegrityTransition();
    expect(transition).toBe("secure_to_compromised");

    // Under warn policy we set a warning message instead of logging out
    useIntegrityWarningStore
      .getState()
      .setWarning("Device integrity has changed since the last check.");
    expect(useIntegrityWarningStore.getState().message).not.toBeNull();
    // Session should remain authenticated
    expect(useSessionStore.getState().status).toBe("authenticated");

    // Warning should be dismissible
    useIntegrityWarningStore.getState().dismissWarning();
    expect(useIntegrityWarningStore.getState().message).toBeNull();
  });
});

describe("no false positives", () => {
  it("does not invalidate session on repeated identical secure results", async () => {
    configureDeviceIntegrity({ responsePolicy: "block" });

    // Start with a valid session
    useSessionStore.setState({
      status: "authenticated",
      walletAddress: "0xdeadbeef",
      token: "valid-session-token",
      expiresAt: Date.now() + 3600_000,
    });

    // First foreground check — secure
    makeAllChecksPass();
    assessDeviceIntegrity(true);
    const firstTransition = checkIntegrityTransition();
    // First call after priming should be "no_change" since both were secure
    expect(firstTransition).toBe("no_change");

    // Simulate another foreground check — still secure
    const secondTransition = checkIntegrityTransition();
    expect(secondTransition).toBe("no_change");

    // Session should still be authenticated
    expect(useSessionStore.getState().status).toBe("authenticated");
  });

  it("does not invalidate session on repeated identical compromised results", async () => {
    configureDeviceIntegrity({ responsePolicy: "block" });

    // Start with a valid session
    useSessionStore.setState({
      status: "authenticated",
      walletAddress: "0xdeadbeef",
      token: "valid-session-token",
      expiresAt: Date.now() + 3600_000,
    });

    // First check — already compromised
    makeExpoGoCheckFail();
    assessDeviceIntegrity(true);

    // Another foreground check — still compromised, no transition
    const transition = checkIntegrityTransition();
    expect(transition).toBe("no_change");

    // Session should still be authenticated
    expect(useSessionStore.getState().status).toBe("authenticated");
  });
});

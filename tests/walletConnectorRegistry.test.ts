/**
 * Wallet connector registration (Issue #226).
 *
 * Replaces the hardcoded `Record<WalletConnectorType, boolean>` in which coinbase
 * and metamask sat at `false`. Unregistered types report unsupported, registered
 * ones defer to their own availability check, and adding a wallet no longer means
 * editing a table in core.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  isConnectorTypeSupported,
  listAvailableConnectors,
  listRegisteredConnectors,
  registerWalletConnector,
  resetWalletConnectorRegistry,
} from "../src/features/wallet/walletConnectorRegistry";
import { isConnectorTypeSupported as isConnectorTypeSupportedFromService } from "../src/features/wallet/walletConnector.service";

beforeEach(() => {
  resetWalletConnectorRegistry();
});

afterEach(() => {
  resetWalletConnectorRegistry();
});

describe("built-in connectors", () => {
  it("supports the connector types that ship with an implementation", () => {
    expect(isConnectorTypeSupported("manual")).toBe(true);
    expect(isConnectorTypeSupported("walletconnect")).toBe(true);
  });

  it("reports connectors with no implementation as unsupported", () => {
    expect(isConnectorTypeSupported("coinbase")).toBe(false);
    expect(isConnectorTypeSupported("metamask")).toBe(false);
  });

  it("does not list unimplemented connectors as registered at all", () => {
    const registeredTypes = listRegisteredConnectors().map((d) => d.type);

    expect(registeredTypes).not.toContain("coinbase");
    expect(registeredTypes).not.toContain("metamask");
  });

  it("is seeded at module load, so support does not depend on app bootstrap", () => {
    // No init function has been called in this suite.
    expect(listRegisteredConnectors().length).toBeGreaterThan(0);
  });

  it("exposes the same answer through the service module's re-export", () => {
    expect(isConnectorTypeSupportedFromService("walletconnect")).toBe(true);
    expect(isConnectorTypeSupportedFromService("coinbase")).toBe(false);
  });
});

describe("registration", () => {
  it("makes a newly registered connector supported without touching core", () => {
    expect(isConnectorTypeSupported("coinbase")).toBe(false);

    registerWalletConnector({
      type: "coinbase",
      label: "Coinbase Wallet",
      isAvailable: () => true,
    });

    expect(isConnectorTypeSupported("coinbase")).toBe(true);
  });

  it("honours a registered connector's own availability check", () => {
    registerWalletConnector({
      type: "metamask",
      label: "MetaMask",
      isAvailable: () => false,
    });

    expect(listRegisteredConnectors().map((d) => d.type)).toContain("metamask");
    expect(isConnectorTypeSupported("metamask")).toBe(false);
    expect(listAvailableConnectors().map((d) => d.type)).not.toContain("metamask");
  });

  it("re-evaluates availability on each call rather than caching it", () => {
    let available = false;

    registerWalletConnector({
      type: "coinbase",
      label: "Coinbase Wallet",
      isAvailable: () => available,
    });

    expect(isConnectorTypeSupported("coinbase")).toBe(false);
    available = true;
    expect(isConnectorTypeSupported("coinbase")).toBe(true);
  });

  it("replaces a descriptor when the same type is registered twice", () => {
    registerWalletConnector({ type: "coinbase", label: "First", isAvailable: () => true });
    registerWalletConnector({ type: "coinbase", label: "Second", isAvailable: () => true });

    const coinbase = listRegisteredConnectors().filter((d) => d.type === "coinbase");

    expect(coinbase).toHaveLength(1);
    expect(coinbase[0].label).toBe("Second");
  });

  it("restores the built-in set on reset, dropping test registrations", () => {
    registerWalletConnector({ type: "coinbase", label: "Coinbase", isAvailable: () => true });
    expect(isConnectorTypeSupported("coinbase")).toBe(true);

    resetWalletConnectorRegistry();

    expect(isConnectorTypeSupported("coinbase")).toBe(false);
    expect(isConnectorTypeSupported("walletconnect")).toBe(true);
  });
});

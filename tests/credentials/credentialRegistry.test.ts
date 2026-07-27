/**
 * Credential issuer plugin registration (Issue #226).
 *
 * Covers the registration mechanism itself. The companion suite
 * `issuerRegistryContract.test.ts` covers the behaviour of the two shipped
 * implementations through the interface.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  getCredentialIssuerRegistry,
  listCredentialIssuerRegistries,
  registerCredentialIssuerRegistry,
  resetCredentialIssuerRegistries,
  tryGetCredentialIssuerRegistry,
} from "../../src/lib/credentials/credentialRegistry";
import type {
  CredentialIssuerRegistry,
  CredentialKind,
} from "../../src/lib/credentials/credentialIssuer.types";

const stubRegistry = (kind: CredentialKind, keyMaterial: string): CredentialIssuerRegistry => ({
  credentialKind: kind,
  async lookupIssuerKey() {
    return { status: "active", keyMaterial };
  },
  async isRevoked() {
    return false;
  },
});

beforeEach(() => {
  resetCredentialIssuerRegistries();
});

afterEach(() => {
  resetCredentialIssuerRegistries();
});

describe("credential issuer registration", () => {
  it("resolves a registered implementation by kind", () => {
    const registry = stubRegistry("qr_access", "key-a");

    registerCredentialIssuerRegistry(registry);

    expect(getCredentialIssuerRegistry("qr_access")).toBe(registry);
  });

  it("keys registrations by the implementation's own credentialKind", () => {
    registerCredentialIssuerRegistry(stubRegistry("eip712_attestation", "key-a"));

    expect(tryGetCredentialIssuerRegistry("eip712_attestation")).toBeDefined();
    expect(tryGetCredentialIssuerRegistry("qr_access")).toBeUndefined();
  });

  it("keeps kinds independent of one another", () => {
    const qr = stubRegistry("qr_access", "qr-key");
    const attestation = stubRegistry("eip712_attestation", "attestation-key");

    registerCredentialIssuerRegistry(qr);
    registerCredentialIssuerRegistry(attestation);

    expect(getCredentialIssuerRegistry("qr_access")).toBe(qr);
    expect(getCredentialIssuerRegistry("eip712_attestation")).toBe(attestation);
    expect(listCredentialIssuerRegistries()).toHaveLength(2);
  });

  it("replaces rather than throws when a kind is registered twice", () => {
    const first = stubRegistry("qr_access", "first");
    const second = stubRegistry("qr_access", "second");

    registerCredentialIssuerRegistry(first);
    expect(() => registerCredentialIssuerRegistry(second)).not.toThrow();

    expect(getCredentialIssuerRegistry("qr_access")).toBe(second);
    expect(listCredentialIssuerRegistries()).toHaveLength(1);
  });

  it("returns undefined from the non-throwing lookup for an unregistered kind", () => {
    expect(tryGetCredentialIssuerRegistry("qr_access")).toBeUndefined();
  });

  it("throws from the strict lookup for an unregistered kind", () => {
    expect(() => getCredentialIssuerRegistry("qr_access")).toThrow(/qr_access/);
  });

  it("drops every registration on reset", () => {
    registerCredentialIssuerRegistry(stubRegistry("qr_access", "key-a"));
    registerCredentialIssuerRegistry(stubRegistry("eip712_attestation", "key-b"));

    resetCredentialIssuerRegistries();

    expect(listCredentialIssuerRegistries()).toEqual([]);
  });
});

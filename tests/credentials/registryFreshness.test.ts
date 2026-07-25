/**
 * Cache-staleness classification shared by both credential issuer registries
 * (Issue #226).
 *
 * The boundary cases are the point of this suite. The QR path treats the offline
 * trust window as inclusive and the attestation persisted path treats it as
 * exclusive; both are pinned here so a future "tidy-up" that unifies them fails
 * loudly instead of quietly moving when a verifier stops accepting credentials.
 */

import { describe, expect, it } from "vitest";
import {
  classifyRegistryFreshness,
  type FreshnessPolicy,
} from "../../src/lib/credentials/registryFreshness";

const TTL_MS = 1_000;
const WINDOW_MS = 5_000;

const inclusive: FreshnessPolicy = {
  ttlMs: TTL_MS,
  offlineTrustWindowMs: WINDOW_MS,
  trustWindowBoundary: "inclusive",
};

const exclusive: FreshnessPolicy = {
  ...inclusive,
  trustWindowBoundary: "exclusive",
};

const at = (age: number, policy: FreshnessPolicy) => classifyRegistryFreshness(0, age, policy);

describe("classifyRegistryFreshness — TTL boundary", () => {
  it("is fresh at age zero", () => {
    expect(at(0, inclusive)).toBe("fresh");
  });

  it("is fresh one millisecond under the TTL", () => {
    expect(at(TTL_MS - 1, inclusive)).toBe("fresh");
  });

  it("is no longer fresh exactly at the TTL", () => {
    expect(at(TTL_MS, inclusive)).toBe("stale_trusted");
  });

  it("treats the TTL boundary identically under both window boundaries", () => {
    expect(at(TTL_MS, exclusive)).toBe("stale_trusted");
  });
});

describe("classifyRegistryFreshness — inclusive trust window (QR path)", () => {
  it("is stale_trusted just under the window", () => {
    expect(at(WINDOW_MS - 1, inclusive)).toBe("stale_trusted");
  });

  it("is still stale_trusted exactly at the window", () => {
    expect(at(WINDOW_MS, inclusive)).toBe("stale_trusted");
  });

  it("expires one millisecond past the window", () => {
    expect(at(WINDOW_MS + 1, inclusive)).toBe("expired");
  });
});

describe("classifyRegistryFreshness — exclusive trust window (attestation persisted tier)", () => {
  it("is stale_trusted just under the window", () => {
    expect(at(WINDOW_MS - 1, exclusive)).toBe("stale_trusted");
  });

  it("expires exactly at the window — one millisecond earlier than the inclusive policy", () => {
    expect(at(WINDOW_MS, exclusive)).toBe("expired");
    expect(at(WINDOW_MS, inclusive)).toBe("stale_trusted");
  });

  it("expires past the window", () => {
    expect(at(WINDOW_MS + 1, exclusive)).toBe("expired");
  });
});

describe("classifyRegistryFreshness — clock skew", () => {
  it("treats a snapshot fetched in the future as fresh rather than expired", () => {
    expect(classifyRegistryFreshness(10_000, 0, inclusive)).toBe("fresh");
  });
});

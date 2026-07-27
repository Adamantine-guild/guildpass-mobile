/**
 * Cache-staleness classification shared by both credential issuer registries.
 *
 * Both registries cache a per-guild key/revocation snapshot with a short TTL and a
 * much longer offline trust window, and both answer the same question of a cached
 * snapshot: is it current, is it usable-but-stale, or is it too old to trust?
 * This is the arithmetic behind that question, and the only part of the two
 * implementations that is genuinely identical.
 *
 * Boundary semantics
 * ------------------
 * `trustWindowBoundary` is required and has no default. The two existing call
 * sites disagree at the boundary and both are pinned by tests:
 *
 *   - `features/access/guildIssuerKey.ts` treats the window as **inclusive**
 *     (`age <= window` is still trusted).
 *   - the persisted branch of `features/attestation/issuerKeyRegistry.ts` treats
 *     it as **exclusive** (`age < window`).
 *
 * The difference is one millisecond wide and load-bearing only at the exact
 * boundary, but it is a real difference in when a verifier stops accepting
 * credentials offline. Rather than silently unify it, every caller must state
 * which it means.
 */

export type RegistryFreshness =
  /** Within TTL — usable without any refresh attempt. */
  | "fresh"
  /** Past TTL but inside the offline trust window — usable if a refresh is impossible. */
  | "stale_trusted"
  /** Past the offline trust window — must not be trusted. */
  | "expired";

export type FreshnessPolicy = {
  ttlMs: number;
  offlineTrustWindowMs: number;
  /** Required — see the boundary note above. Callers must not inherit a default. */
  trustWindowBoundary: "inclusive" | "exclusive";
};

/**
 * Classify a cached snapshot by age.
 *
 * @param fetchedAt Epoch ms the snapshot was obtained.
 * @param now       Epoch ms to measure against.
 * @param policy    TTL, trust window, and the trust-window boundary.
 */
export function classifyRegistryFreshness(
  fetchedAt: number,
  now: number,
  policy: FreshnessPolicy,
): RegistryFreshness {
  const age = now - fetchedAt;

  if (age < policy.ttlMs) return "fresh";

  const withinTrustWindow =
    policy.trustWindowBoundary === "inclusive"
      ? age <= policy.offlineTrustWindowMs
      : age < policy.offlineTrustWindowMs;

  return withinTrustWindow ? "stale_trusted" : "expired";
}

/**
 * Shared contract for credential issuer key resolution and revocation.
 *
 * GuildPass verifies two independent credential kinds — signed QR access payloads
 * (`features/access`) and EIP-712 role attestations (`features/attestation`) — and
 * each grew its own issuer-key registry with its own TTL, offline trust window and
 * fail-closed policy. This module is the interface they now share.
 *
 * What is deliberately NOT shared is the mechanism behind the interface:
 *
 *   - The QR path refreshes over the network (`guilds.getGuildConfig`) when its
 *     cache passes TTL, then falls back to cache inside the trust window.
 *   - The attestation path never touches the network. Its registry is pushed in by
 *     `cacheAttestationRevocationRegistry()` during online verification, and the
 *     revocation check is documented as an in-memory lookup that runs *before*
 *     signature verification precisely because it does no I/O.
 *
 * Unifying those would change behaviour on one side or the other, so only the
 * shape and the staleness arithmetic (`registryFreshness.ts`) are common.
 *
 * Fail-closed contract
 * --------------------
 * Implementations MUST NOT throw. An indeterminate outcome is reported as
 * `status: "unavailable"` (or `null` from `isRevoked`), and callers MUST treat
 * that as a rejection. A verifier that cannot confirm a key's continued validity
 * must not accept a credential that key may have signed.
 */

export type CredentialKind = "qr_access" | "eip712_attestation";

/** How a credential names the key that signed it. */
export type IssuerKeyRef =
  | { kind: "kid"; kid: string }
  | { kind: "address"; address: `0x${string}` };

export type IssuerKeyUnavailableReason =
  /** Nothing cached and nothing fetchable. */
  | "no_registry_data"
  /** Cached, but past the offline trust window. */
  | "registry_expired"
  /** A refresh was attempted and failed with no usable cache behind it. */
  | "fetch_failed"
  /** The registry resolved, but publishes no key for this reference. */
  | "no_usable_key"
  /** Several active keys and the credential named none of them. */
  | "ambiguous_key";

export type IssuerKeyLookup =
  | { status: "active"; keyMaterial: string }
  | { status: "revoked"; ref: IssuerKeyRef }
  | { status: "unknown"; ref: IssuerKeyRef }
  | {
      status: "unavailable";
      reason: IssuerKeyUnavailableReason;
      /**
       * Implementation-specific diagnostic text. Feature-level wrappers use it to
       * reproduce their own error messages verbatim; nothing should branch on it.
       */
      detail?: string;
    };

export interface CredentialIssuerRegistry {
  readonly credentialKind: CredentialKind;

  /**
   * Resolve the key material a credential should be verified against.
   *
   * Never throws. `ref` is `null` when the credential carries no key identifier,
   * which implementations may resolve through a legacy single-key fallback.
   */
  lookupIssuerKey(
    guildId: string,
    ref: IssuerKeyRef | null,
    now?: Date,
  ): Promise<IssuerKeyLookup>;

  /**
   * Revocation status for a specific key reference.
   *
   * Never throws. `null` means the status could not be determined — fail closed.
   */
  isRevoked(guildId: string, ref: IssuerKeyRef, now?: Date): Promise<boolean | null>;
}

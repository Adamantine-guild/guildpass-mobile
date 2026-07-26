/**
 * Security feature types for GuildPass Mobile.
 *
 * Covers device integrity checks (root/jailbreak detection) and
 * certificate pinning configuration.
 */

/** Severity level for a detected integrity violation. */
export type IntegrityViolationSeverity = "warn" | "block";

/** Result of a single integrity check. */
export interface IntegrityCheckResult {
  /** Human-readable name of the check performed. */
  readonly check: string;
  /** Whether the check passed (true = device looks clean). */
  readonly passed: boolean;
  /** Optional detail on why the check failed. */
  readonly detail?: string;
}

/** Aggregate result of all device integrity checks. */
export interface DeviceIntegrityResult {
  /** Overall assessment — true means no violations were detected. */
  readonly isSecure: boolean;
  /** List of individual check results. */
  readonly checks: readonly IntegrityCheckResult[];
  /** Timestamp of the assessment (epoch ms). */
  readonly assessedAt: number;
}

/** Response policy when a device integrity violation is detected. */
export type IntegrityResponsePolicy = "warn" | "block";

/** Configuration for device integrity monitoring. */
export interface DeviceIntegrityConfig {
  /** Policy when a root/jailbreak is detected. Default: "block". */
  readonly responsePolicy: IntegrityResponsePolicy;
  /** If true, re-check integrity on app foreground. Default: true. */
  readonly checkOnForeground: boolean;
  /** Minimum interval (ms) between integrity re-checks. Default: 60000. */
  readonly minCheckIntervalMs: number;
}

/** A pinning key entry: the public key SHA-256 hash (base64-encoded). */
export interface PinningKey {
  /** Base64-encoded SHA-256 digest of the SubjectPublicKeyInfo (SPKI). */
  readonly hash: string;
  /** Human-readable label for tracking (e.g. "guildpass-primary-2026"). */
  readonly label: string;
  /** ISO 8601 date when this pin was added. */
  readonly addedAt: string;
  /** ISO 8601 date when this pin expires (if known). */
  readonly expiresAt?: string;
}

/** Configuration for certificate/public-key pinning. */
export interface PinningConfig {
  /** Domain(s) to which pinning applies. */
  readonly domains: readonly string[];
  /** The set of accepted public-key hashes. At least one backup is required. */
  readonly pins: readonly PinningKey[];
  /** If true, fail OPEN on pin validation error (not recommended). Default: false. */
  readonly failOpen: boolean;
  /** Reporting URL for pin validation failures (optional). */
  readonly reportUri?: string;
}

/** The API domain extracted from app config — centralized for consistency. */
export const GUILDPASS_API_DOMAIN = "api.guildpass.xyz";

/** Staging domain, also pinned. */
export const GUILDPASS_STAGING_DOMAIN = "staging.guildpass.xyz";

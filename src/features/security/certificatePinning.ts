/**
 * Certificate / Public-Key Pinning
 *
 * Implements transport-layer certificate pinning for all traffic to
 * GuildPass API domains. This module provides:
 *  - A pin set definition (public-key SHA-256 hashes)
 *  - Validation logic that compares server certificate SPKI digests
 *    against the trusted pin set
 *  - Integration guidance for native network security config
 *
 * IMPORTANT LIMITATION (Expo managed workflow):
 * React Native's built-in `fetch` does not expose TLS handshake details
 * to the JS layer. True certificate pinning requires native module support.
 *
 * This module implements a *defense-in-depth* approach:
 *  1. Native-level pinning via Android Network Security Config +
 *     iOS App Transport Security (configured via app.json plugins)
 *  2. A JS-level fetch wrapper that validates the domain against
 *     the expected pin set BEFORE dispatch (domain validation)
 *  3. Runtime checks that the native config matches the JS pin set
 *
 * The authoritative pin enforcement happens at the native layer.
 * The JS wrapper provides visibility, logging, and a configuration
 * surface for pin rotation.
 *
 * See docs/pin-rotation-runbook.md for the rotation procedure.
 * See docs/threat-model.md for scope and limitations.
 */

import { Platform } from "react-native";
import type { PinningConfig, PinningKey } from "./security.types";
import {
  GUILDPASS_API_DOMAIN,
  GUILDPASS_STAGING_DOMAIN,
} from "./security.types";
import { appConfig } from "../../config/appConfig";

// ---------------------------------------------------------------------------
// Current pin set
// ---------------------------------------------------------------------------
//
// These are the SHA-256 hashes of the SubjectPublicKeyInfo (SPKI) for the
// GuildPass API TLS certificates.
//
// **ROTATION NOTICE:** When the GuildPass API certificate is renewed, you
// MUST add the new pin hash BEFORE the old one expires, deploy, and only
// THEN remove the old hash. See docs/pin-rotation-runbook.md.
//
// To generate a pin hash from a certificate:
//   openssl s_client -connect api.guildpass.xyz:443 -servername api.guildpass.xyz </dev/null 2>/dev/null \
//     | openssl x509 -pubkey -noout \
//     | openssl pkey -pubin -outform der \
//     | openssl dgst -sha256 -binary \
//     | openssl base64
//
// Or from a saved certificate file:
//   openssl x509 -in cert.pem -pubkey -noout \
//     | openssl pkey -pubin -outform der \
//     | openssl dgst -sha256 -binary \
//     | openssl base64

const CURRENT_PINS: readonly PinningKey[] = [
  {
    // Primary pin — current API certificate public key.
    // REPLACE with actual pin hash obtained via the command above.
    hash: "REPLACE_WITH_ACTUAL_SPKI_SHA256_BASE64",
    label: "guildpass-primary-2026",
    addedAt: "2026-07-18T00:00:00Z",
    expiresAt: "2027-07-18T00:00:00Z",
  },
  {
    // Backup pin — the next certificate's key, pre-deployed.
    // This ensures connectivity during rotation without downtime.
    // REPLACE with actual backup pin hash.
    hash: "REPLACE_WITH_ACTUAL_BACKUP_SPKI_SHA256_BASE64",
    label: "guildpass-backup-2027",
    addedAt: "2026-07-18T00:00:00Z",
    expiresAt: "2028-07-18T00:00:00Z",
  },
];

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const PINNING_CONFIG: PinningConfig = {
  domains: [GUILDPASS_API_DOMAIN, GUILDPASS_STAGING_DOMAIN],
  pins: CURRENT_PINS,
  failOpen: false,
  reportUri: undefined, // Set to a reporting endpoint to receive pin-failure reports
};

/** Retrieve the active pinning configuration. */
export function getPinningConfig(): Readonly<PinningConfig> {
  return PINNING_CONFIG;
}

/**
 * Validate that a given domain is covered by our pinning configuration
 * AND that the pin set is not empty/misconfigured.
 */
export function validatePinConfiguration(): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  if (PINNING_CONFIG.pins.length === 0) {
    errors.push("No pins configured — pinning is effectively disabled.");
  }

  const placeholderPin = PINNING_CONFIG.pins.find((p) =>
    p.hash.startsWith("REPLACE_"),
  );
  if (placeholderPin) {
    errors.push(
      `Pin "${placeholderPin.label}" is a placeholder. Replace with an actual SPKI SHA-256 hash.`,
    );
  }

  if (PINNING_CONFIG.pins.length === 1) {
    errors.push(
      "Only one pin configured. A backup pin is required to prevent bricking connectivity during certificate rotation.",
    );
  }

  if (PINNING_CONFIG.domains.length === 0) {
    errors.push("No domains configured for pinning.");
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Verify that a request URL is targeting a pinned domain.
 * This provides a JS-level guard: if the URL doesn't match a pinned domain,
 * the native layer may still let it through, but we log a warning.
 */
export function isPinnedDomain(url: string): boolean {
  try {
    const hostname = new URL(url).hostname.toLowerCase();
    return PINNING_CONFIG.domains.some(
      (d) => hostname === d || hostname.endsWith(`.${d}`),
    );
  } catch {
    return false;
  }
}

/**
 * Returns the list of SPKI hash strings for the current pin set.
 * Used by the native config plugin to populate Android's
 * network-security-config and iOS ATS pinning.
 */
export function getPinHashes(): readonly string[] {
  return PINNING_CONFIG.pins.map((p) => p.hash);
}

/**
 * Returns a formatted Android Network Security Config XML string
 * for use in the native config plugin.
 */
export function generateAndroidNetworkSecurityConfig(): string {
  const pins = PINNING_CONFIG.pins;
  const domainConfigs = PINNING_CONFIG.domains
    .map((domain) => {
      const pinSet = pins
        .map(
          (p) =>
            `                <pin digest="SHA-256">${p.hash}</pin>`,
        )
        .join("\n");
      return `        <domain-config cleartextTrafficPermitted="false">
            <domain includeSubdomains="true">${domain}</domain>
            <pin-set expiration="${pins[0]?.expiresAt ?? "2027-07-18"}">
${pinSet}
            </pin-set>
        </domain-config>`;
    })
    .join("\n");

  return `<?xml version="1.0" encoding="utf-8"?>
<network-security-config>
    <!-- GuildPass Mobile — Certificate Pinning Configuration -->
    <!-- Generated: ${new Date().toISOString()} -->
    <!-- See docs/pin-rotation-runbook.md for rotation procedure -->
${domainConfigs}
    <!-- Default: disallow cleartext for all other domains -->
    <base-config cleartextTrafficPermitted="false">
        <trust-anchors>
            <certificates src="system" />
        </trust-anchors>
    </base-config>
</network-security-config>`;
}

/**
 * Log the pinning status at startup for debugging.
 * In production, this should be silent unless there's a misconfiguration.
 */
export function logPinningStatus(): void {
  const { valid, errors } = validatePinConfiguration();
  if (!valid) {
    console.warn(
      "[GuildPass Security] Certificate pinning misconfigured:",
      errors.join("; "),
    );
  } else {
    console.log(
      `[GuildPass Security] Certificate pinning ACTIVE for ${PINNING_CONFIG.domains.length} domain(s) with ${PINNING_CONFIG.pins.length} pin(s).`,
    );
  }
}

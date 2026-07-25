/**
 * EIP-712 signature verification for role attestations
 * Enables cryptographic proof of role membership
 *
 * Revocation-aware validation pipeline
 * -------------------------------------
 * validateAttestation() runs checks in the following order, deliberately
 * chosen to minimise work before rejecting an invalid attestation:
 *
 *   1. Expiry check  (O(1), no I/O)
 *   2. Revocation check  (in-memory Map lookup, no network).
 *      If revocation data is unavailable (offline with no cached data)
 *      the policy is **FAIL CLOSED**: the attestation is rejected with
 *      a "revocation_data_unavailable" result.  See
 *      issuerKeyRegistry.checkIssuerKeyRevoked() for the caching/trust-
 *      window logic.
 *   3. Cryptographic signature verification (asymmetric crypto, most
 *      expensive) — performed last.
 *
 * Offline / revocation-data-unavailable policy: FAIL CLOSED
 * ----------------------------------------------------------
 * Because attestations are designed as portable, long-lived proofs that
 * may be verified months after issuance by third parties with no
 * connection to the GuildPass backend, the conservative default is to
 * **reject** when revocation status cannot be confirmed.  A verifier
 * that cannot check whether the issuer key was revoked must not accept
 * a proof that might have been signed by a compromised key.
 */

import { verifyTypedData } from "viem";
import {
  type RoleAttestation,
  type AttestationValidationResult,
  type GuildIssuerKey,
  EIP712_TYPES,
  createEIP712Domain,
  ATTESTATION_REVOCATION_REASONS,
} from "./types";
import { checkIssuerKeyRevoked } from "./issuerKeyRegistry";

/**
 * Verifies an attestation signature against a known issuer public key
 *
 * @param attestation The attestation to verify (signature will be excluded from verification)
 * @param issuerAddress The issuer's public key address
 * @param chainId The blockchain chainId for domain separation
 * @returns Validation result with signature recovery if successful
 */
export async function verifyAttestationSignature(
  attestation: RoleAttestation,
  issuerAddress: `0x${string}`,
  chainId: number,
): Promise<AttestationValidationResult> {
  try {
    // Verify the signature using EIP-712 typed data
    const isValid = await verifyTypedData({
      address: issuerAddress,
      domain: createEIP712Domain(chainId),
      types: EIP712_TYPES,
      primaryType: "RoleAttestation",
      message: {
        guildId: attestation.guildId,
        roleId: attestation.roleId,
        wallet: attestation.wallet,
        issuedAt: BigInt(attestation.issuedAt),
        expiresAt: BigInt(attestation.expiresAt),
      },
      signature: attestation.signature,
    });

    if (!isValid) {
      return {
        valid: false,
        reason: "Invalid signature - does not match issuer key",
        recoveredSigner: issuerAddress,
      };
    }

    return {
      valid: true,
      recoveredSigner: issuerAddress,
    };
  } catch (error) {
    return {
      valid: false,
      reason: `Signature verification failed: ${error instanceof Error ? error.message : "Unknown error"}`,
    };
  }
}

/**
 * Checks if an attestation has expired
 *
 * @param attestation The attestation to check
 * @returns Expiry check result
 */
export function checkAttestationExpiry(attestation: RoleAttestation): {
  expired: boolean;
  remainingSeconds: number;
} {
  const nowSeconds = Math.floor(Date.now() / 1000);
  const remainingSeconds = attestation.expiresAt - nowSeconds;

  return {
    expired: remainingSeconds <= 0,
    remainingSeconds: Math.max(0, remainingSeconds),
  };
}

/**
 * Checks whether the attestation's issuer key has been revoked.
 *
 * Returns one of three outcomes via the result object:
 *  - `{ revoked: false }`  — key is definitively NOT revoked
 *  - `{ revoked: true }`   — key IS revoked, attestation should be rejected
 *  - `{ revoked: true, unavailable: true }` — revocation status could not be
 *    determined (offline and no cached data).  The caller should reject.
 *
 * This check is performed **before** cryptographic signature verification
 * because it is faster (in-memory lookup) and even if the signature is valid,
 * a revoked key invalidates the attestation regardless.
 *
 * @param guildId       Guild to check against.
 * @param issuerAddress Issuer address that signed the attestation.
 */
export async function checkAttestationRevocation(
  guildId: string,
  issuerAddress: `0x${string}`,
): Promise<{ revoked: boolean; unavailable?: boolean }> {
  const isRevoked = await checkIssuerKeyRevoked(guildId, issuerAddress);

  if (isRevoked === null) {
    // Revocation data unavailable — fail closed
    return { revoked: true, unavailable: true };
  }

  return { revoked: isRevoked };
}

/**
 * Comprehensive validation of an attestation
 * Checks: expiry → revocation → signature validity
 *
 * @param attestation The attestation to validate
 * @param issuerAddress The expected issuer address
 * @param chainId The blockchain chainId
 * @returns Complete validation result
 */
export async function validateAttestation(
  attestation: RoleAttestation,
  issuerAddress: `0x${string}`,
  chainId: number,
): Promise<AttestationValidationResult> {
  // ── 1. Expiry check (O(1), no I/O) ──
  const expiryCheck = checkAttestationExpiry(attestation);

  if (expiryCheck.expired) {
    return {
      valid: false,
      reason: "Attestation has expired",
      expired: true,
      remainingValidity: 0,
    };
  }

  // ── 2. Revocation check (in-memory lookup) ──
  const revocationResult = await checkAttestationRevocation(attestation.guildId, issuerAddress);

  if (revocationResult.revoked) {
    if (revocationResult.unavailable) {
      // Revocation data could not be obtained (offline, no cache).
      // FAIL CLOSED — reject rather than accept an unverifiable attestation.
      return {
        valid: false,
        reason: ATTESTATION_REVOCATION_REASONS.REVOCATION_DATA_UNAVAILABLE,
        issuerKeyRevoked: false,
        revocationCheckSkipped: true,
      };
    }

    // Key is definitively revoked
    return {
      valid: false,
      reason: ATTESTATION_REVOCATION_REASONS.KEY_REVOKED,
      issuerKeyRevoked: true,
      revocationCheckSkipped: false,
    };
  }

  // ── 3. Cryptographic signature verification (most expensive) ──
  const signatureResult = await verifyAttestationSignature(attestation, issuerAddress, chainId);

  if (!signatureResult.valid) {
    return signatureResult;
  }

  // All checks passed
  return {
    valid: true,
    recoveredSigner: issuerAddress,
    expired: false,
    remainingValidity: expiryCheck.remainingSeconds,
    issuerKeyRevoked: false,
    revocationCheckSkipped: false,
  };
}

/**
 * Gets the attestation validity status for display
 *
 * @param attestation The attestation to check
 * @returns Human-readable validity status
 */
export function getAttestationValidityStatus(attestation: RoleAttestation): string {
  const { expired, remainingSeconds } = checkAttestationExpiry(attestation);

  if (expired) {
    return "Expired";
  }

  if (remainingSeconds < 3600) {
    // Less than 1 hour
    return `Expires in ${Math.floor(remainingSeconds / 60)} minutes`;
  }

  if (remainingSeconds < 86400) {
    // Less than 1 day
    return `Expires in ${Math.floor(remainingSeconds / 3600)} hours`;
  }

  const days = Math.floor(remainingSeconds / 86400);
  return `Expires in ${days} day${days > 1 ? "s" : ""}`;
}

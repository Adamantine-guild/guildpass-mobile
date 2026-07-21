/**
 * EIP-712 signature verification for role attestations
 * Enables cryptographic proof of role membership
 */

import { verifyTypedData } from 'viem';
import {
  type RoleAttestation,
  type AttestationValidationResult,
  type GuildIssuerKey,
  EIP712_TYPES,
  createEIP712Domain,
} from './types';

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
  chainId: number
): Promise<AttestationValidationResult> {
  try {
    // Verify the signature using EIP-712 typed data
    const isValid = await verifyTypedData({
      address: issuerAddress,
      domain: createEIP712Domain(chainId),
      types: EIP712_TYPES,
      primaryType: 'RoleAttestation',
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
        reason: 'Invalid signature - does not match issuer key',
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
      reason: `Signature verification failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
    };
  }
}

/**
 * Checks if an attestation has expired
 *
 * @param attestation The attestation to check
 * @returns Expiry check result
 */
export function checkAttestationExpiry(
  attestation: RoleAttestation
): { expired: boolean; remainingSeconds: number } {
  const nowSeconds = Math.floor(Date.now() / 1000);
  const remainingSeconds = attestation.expiresAt - nowSeconds;

  return {
    expired: remainingSeconds <= 0,
    remainingSeconds: Math.max(0, remainingSeconds),
  };
}

/**
 * Comprehensive validation of an attestation
 * Checks signature validity and expiration
 *
 * @param attestation The attestation to validate
 * @param issuerAddress The expected issuer address
 * @param chainId The blockchain chainId
 * @returns Complete validation result
 */
export async function validateAttestation(
  attestation: RoleAttestation,
  issuerAddress: `0x${string}`,
  chainId: number
): Promise<AttestationValidationResult> {
  // Check expiry first (cheaper than signature verification)
  const expiryCheck = checkAttestationExpiry(attestation);

  if (expiryCheck.expired) {
    return {
      valid: false,
      reason: 'Attestation has expired',
      expired: true,
      remainingValidity: 0,
    };
  }

  // Verify signature
  const signatureResult = await verifyAttestationSignature(
    attestation,
    issuerAddress,
    chainId
  );

  if (!signatureResult.valid) {
    return signatureResult;
  }

  // All checks passed
  return {
    valid: true,
    recoveredSigner: issuerAddress,
    expired: false,
    remainingValidity: expiryCheck.remainingSeconds,
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
    return 'Expired';
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
  return `Expires in ${days} day${days > 1 ? 's' : ''}`;
}

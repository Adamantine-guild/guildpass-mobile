/**
 * EIP-712 signed attestation types for cryptographic role verification.
 * Enables offline verification of role membership without backend dependency.
 */

/**
 * Raw attestation data structure as defined in EIP-712 domain
 */
export interface RoleAttestation {
  /** Guild ID this role belongs to */
  guildId: string;

  /** Role ID being attested */
  roleId: string;

  /** Wallet address holding the role */
  wallet: `0x${string}`;

  /** Unix timestamp when attestation was issued */
  issuedAt: number;

  /** Unix timestamp when attestation expires */
  expiresAt: number;

  /** Signature of this attestation by the guild's issuer key */
  signature: `0x${string}`;
}

/**
 * Validation result for an attestation
 */
export interface AttestationValidationResult {
  /** Whether the attestation is valid and verifiable */
  valid: boolean;

  /** Reason if invalid */
  reason?: string;

  /** Recovered signer address if successfully verified */
  recoveredSigner?: `0x${string}`;

  /** Whether attestation has expired */
  expired?: boolean;

  /** Remaining validity time in seconds, if valid */
  remainingValidity?: number;
}

/**
 * Guild issuer public key, used to verify attestations
 * Registered on-chain, cached locally for offline verification
 */
export interface GuildIssuerKey {
  /** Guild ID */
  guildId: string;

  /** Issuer public key (address) */
  issuerAddress: `0x${string}`;

  /** When this issuer key was registered/updated */
  registeredAt: number;

  /** When this entry was cached locally */
  cachedAt: number;
}

/**
 * Cached attestation with metadata
 */
export interface CachedAttestation extends RoleAttestation {
  /** When this was cached */
  cachedAt: number;

  /** Validation result from last check */
  lastValidation?: AttestationValidationResult;
}

/**
 * EIP-712 type definitions for hashing and signature verification
 */
export const EIP712_TYPES = {
  RoleAttestation: [
    { name: 'guildId', type: 'string' },
    { name: 'roleId', type: 'string' },
    { name: 'wallet', type: 'address' },
    { name: 'issuedAt', type: 'uint256' },
    { name: 'expiresAt', type: 'uint256' },
  ],
} as const;

/**
 * EIP-712 domain separator
 * Identifies the app and prevents cross-chain/app replay attacks
 */
export const createEIP712Domain = (chainId: number) => ({
  name: 'GuildPass',
  version: '1.0',
  chainId,
  verifyingContract: '0x0000000000000000000000000000000000000000' as `0x${string}`,
});

/**
 * Attestation storage keys
 */
export const ATTESTATION_STORAGE_KEYS = {
  ATTESTATIONS: 'guildpass:attestations:',
  ISSUER_KEYS: 'guildpass:issuer-keys:',
  ISSUER_KEYS_INDEX: 'guildpass:issuer-keys-index',
  ATTESTATION_INDEX: 'guildpass:attestation-index',
} as const;

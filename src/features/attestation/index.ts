/**
 * GuildPass Role Attestation Module
 *
 * Provides cryptographically verifiable proofs of role membership using EIP-712
 * signed attestations. Existing attestations can be verified independently and
 * offline while the required local data remains available; this module does not
 * provide automatic cross-device recovery.
 *
 * @module features/attestation
 */

// Types
export * from "./types";

// Core verification
export * from "./verifySignature";

// Storage layers
export * from "./attestationStorage";
export * from "./issuerKeyRegistry";

// Service
export { AttestationService } from "./attestationService";
export type { AttestationServiceConfig } from "./attestationService";

// React hooks
export * from "./useAttestations";

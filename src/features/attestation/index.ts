/**
 * GuildPass Role Attestation Module
 *
 * Provides cryptographically verifiable, user-portable proofs of role membership
 * using EIP-712 signed attestations. Enables offline verification without backend dependency.
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

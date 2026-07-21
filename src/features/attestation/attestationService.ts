/**
 * Core attestation service
 * Orchestrates attestation fetching, verification, caching and local verification
 */

import { type RoleAttestation, type GuildIssuerKey, type AttestationValidationResult } from './types';
import { validateAttestation, getAttestationValidityStatus } from './verifySignature';
import {
  getCachedIssuerKey,
  cacheIssuerKey,
  invalidateIssuerKeyCache,
  cacheAttestationRevocationRegistry,
} from './issuerKeyRegistry';
import {
  cacheAttestation,
  getCachedAttestation,
  removeCachedAttestation,
  getAttestationsForGuild,
} from './attestationStorage';

/**
 * Callback for fetching revocation registry from the backend.
 * Returns the set of revoked issuer addresses (0x-prefixed hex) for the guild.
 */
export type FetchRevocationRegistry = (guildId: string) => Promise<string[]>;

/**
 * Attestation service configuration
 */
export interface AttestationServiceConfig {
  chainId: number;
  // Future SDK function to fetch issuer keys - will be added to @guildpass/sdk
  fetchIssuerKey: (guildId: string) => Promise<`0x${string}`>;
  // SDK function to fetch attestation
  fetchAttestation: (params: {
    walletAddress: string;
    guildId: string;
    roleId: string;
  }) => Promise<RoleAttestation>;
  /**
   * Optional callback to fetch the set of revoked issuer addresses for a guild.
   * When provided, the service populates the revocation cache during online
   * verification, enabling offline revocation checks later.
   *
   * If omitted, revocation data must be seeded via
   * `cacheAttestationRevocationRegistry()` externally, or else
   * `validateAttestation()` will fail closed (rejecting unverifiable attestations).
   */
  fetchRevocationRegistry?: FetchRevocationRegistry;
}

/**
 * Core attestation service for managing role attestations
 */
export class AttestationService {
  private chainId: number;
  private fetchIssuerKey: (guildId: string) => Promise<`0x${string}`>;
  private fetchAttestation: (params: {
    walletAddress: string;
    guildId: string;
    roleId: string;
  }) => Promise<RoleAttestation>;
  private fetchRevocationRegistry?: FetchRevocationRegistry;

  constructor(config: AttestationServiceConfig) {
    this.chainId = config.chainId;
    this.fetchIssuerKey = config.fetchIssuerKey;
    this.fetchAttestation = config.fetchAttestation;
    this.fetchRevocationRegistry = config.fetchRevocationRegistry;
  }

  /**
   * Fetch and verify an attestation from backend
   * Caches the result for offline verification
   *
   * @param walletAddress The wallet address
   * @param guildId The guild ID
   * @param roleId The role ID
   * @returns Validated attestation or error
   */
  async fetchAndVerifyAttestation(
    walletAddress: string,
    guildId: string,
    roleId: string
  ): Promise<{
    valid: boolean;
    attestation?: RoleAttestation;
    error?: string;
    validityStatus?: string;
  }> {
    try {
      // Fetch attestation from backend
      const attestation = await this.fetchAttestation({
        walletAddress,
        guildId,
        roleId,
      });

      // Get issuer key (cached or fresh)
      const issuerAddress = await this.getIssuerKey(guildId);

      // Populate revocation cache if a fetch callback is configured
      await this.maybeRefreshRevocationCache(guildId);

      // Verify the attestation
      const validationResult = await validateAttestation(
        attestation,
        issuerAddress,
        this.chainId
      );

      if (!validationResult.valid) {
        return {
          valid: false,
          error: validationResult.reason,
        };
      }

      // Cache the attestation for offline use
      await cacheAttestation(walletAddress, attestation);

      return {
        valid: true,
        attestation,
        validityStatus: getAttestationValidityStatus(attestation),
      };
    } catch (error) {
      return {
        valid: false,
        error: error instanceof Error ? error.message : 'Unknown error fetching attestation',
      };
    }
  }

  /**
   * Verify a locally cached attestation
   * Can work offline once attestation is cached and issuer key is known
   *
   * @param walletAddress The wallet address
   * @param guildId The guild ID
   * @param roleId The role ID
   * @returns Validation result
   */
  async verifyLocalAttestation(
    walletAddress: string,
    guildId: string,
    roleId: string
  ): Promise<AttestationValidationResult> {
    try {
      // Get cached attestation
      const cached = await getCachedAttestation(walletAddress, guildId, roleId);

      if (!cached) {
        return {
          valid: false,
          reason: 'No cached attestation found',
        };
      }

      // Get issuer key (may be cached for offline verification)
      const issuerKey = await getCachedIssuerKey(guildId);

      if (!issuerKey) {
        return {
          valid: false,
          reason: 'Issuer key not cached - requires online fetch',
        };
      }

      // Verify the cached attestation
      const result = await validateAttestation(
        cached,
        issuerKey.issuerAddress,
        this.chainId
      );

      return result;
    } catch (error) {
      return {
        valid: false,
        reason: error instanceof Error ? error.message : 'Verification failed',
      };
    }
  }

  /**
   * Optionally refresh the revocation cache from the backend.
   * No-op if no fetchRevocationRegistry callback is configured.
   * This is called during online verification so that offline checks
   * have recent revocation data within the trust window.
   */
  private async maybeRefreshRevocationCache(guildId: string): Promise<void> {
    if (!this.fetchRevocationRegistry) {
      return;
    }

    try {
      const revokedAddresses = await this.fetchRevocationRegistry(guildId);
      if (Array.isArray(revokedAddresses)) {
        await cacheAttestationRevocationRegistry(
          guildId,
          new Set(revokedAddresses.map((a) => a.toLowerCase())),
        );
      }
    } catch (error) {
      // Non-fatal: revocation data is best-effort during online fetch.
      // If the fetch fails, existing cached data (if any) will be used
      // for the trust-window check, or the next validation will fail closed.
      console.warn(`Failed to refresh revocation registry for guild ${guildId}:`, error);
    }
  }

  /**
   * Get issuer key for a guild, using cache if available
   * Falls back to backend fetch if cache is stale
   *
   * @param guildId The guild ID
   * @returns The issuer address
   */
  async getIssuerKey(guildId: string): Promise<`0x${string}`> {
    // Try to get from cache
    const cached = await getCachedIssuerKey(guildId);

    if (cached) {
      return cached.issuerAddress;
    }

    // Fetch from backend and cache
    const issuerAddress = await this.fetchIssuerKey(guildId);

    const issuerKey: GuildIssuerKey = {
      guildId,
      issuerAddress,
      registeredAt: Math.floor(Date.now() / 1000),
      cachedAt: Date.now(),
    };

    await cacheIssuerKey(issuerKey);

    return issuerAddress;
  }

  /**
   * Check if a wallet has a valid cached attestation for a role
   * Useful for offline role verification UI
   *
   * @param walletAddress The wallet address
   * @param guildId The guild ID
   * @param roleId The role ID
   * @returns Whether a valid cached attestation exists
   */
  async hasCachedAttestation(
    walletAddress: string,
    guildId: string,
    roleId: string
  ): Promise<boolean> {
    const cached = await getCachedAttestation(walletAddress, guildId, roleId);

    if (!cached) {
      return false;
    }

    // Check if still valid
    const issuerKey = await getCachedIssuerKey(guildId);

    if (!issuerKey) {
      return false;
    }

    const result = await validateAttestation(
      cached,
      issuerKey.issuerAddress,
      this.chainId
    );

    return result.valid;
  }

  /**
   * Get all valid cached attestations for a wallet in a guild
   *
   * @param walletAddress The wallet address
   * @param guildId The guild ID
   * @returns Array of valid cached attestations
   */
  async getCachedAttestationsForGuild(
    walletAddress: string,
    guildId: string
  ): Promise<RoleAttestation[]> {
    const attestations = await getAttestationsForGuild(walletAddress, guildId);
    const issuerKey = await getCachedIssuerKey(guildId);

    if (!issuerKey) {
      return [];
    }

    const valid: RoleAttestation[] = [];

    for (const attestation of attestations) {
      const result = await validateAttestation(
        attestation,
        issuerKey.issuerAddress,
        this.chainId
      );

      if (result.valid) {
        valid.push(attestation);
      } else if (result.expired) {
        // Remove expired attestations
        await removeCachedAttestation(walletAddress, guildId, attestation.roleId);
      }
    }

    return valid;
  }

  /**
   * Refresh issuer key from backend, invalidating cache
   * Use after guild admin key rotation
   *
   * @param guildId The guild ID
   * @returns The new issuer address
   */
  async refreshIssuerKey(guildId: string): Promise<`0x${string}`> {
    await invalidateIssuerKeyCache(guildId);
    return this.getIssuerKey(guildId);
  }
}

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
} from './issuerKeyRegistry';
import {
  cacheAttestation,
  getCachedAttestation,
  removeCachedAttestation,
  getAttestationsForGuild,
} from './attestationStorage';

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

  constructor(config: AttestationServiceConfig) {
    this.chainId = config.chainId;
    this.fetchIssuerKey = config.fetchIssuerKey;
    this.fetchAttestation = config.fetchAttestation;
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

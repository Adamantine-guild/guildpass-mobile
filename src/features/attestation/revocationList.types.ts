/**
 * Types for offline revocation list distribution
 */

export interface RevokedKeyEntry {
  keyId?: string;
  address: string;
  revokedAt: number;
  reason?: 'compromised' | 'rotation' | 'admin' | 'other';
}

export interface RevocationList {
  guildId: string;
  version: number;
  issuedAt: number;
  expiresAt: number;
  revokedKeys: RevokedKeyEntry[];
  signature: string;
}

export interface CachedRevocationList {
  list: RevocationList;
  cachedAt: number;
  contentHash: string;
  signatureVerified: boolean;
}

export interface RevocationCheckResult {
  status: 'valid' | 'revoked' | 'unknown' | 'unavailable';
  reason?: string;
  failClosed?: boolean;
  listVersion?: number;
  dataAge?: number;
}

export interface RevocationCacheConfig {
  cacheTtlMs: number;
  offlineTrustWindowMs: number;
  maxListSize: number;
  failClosed: boolean;
}

export interface SerializedRevocationList {
  version: 1;
  guildId: string;
  listVersion: number;
  issuedAt: number;
  expiresAt: number;
  revokedKeys: Array<{
    keyId?: string;
    address: string;
    revokedAt: number;
    reason?: string;
  }>;
  signature: string;
  cachedAt: number;
  contentHash: string;
  signatureVerified: boolean;
  checksum: string;
}

export interface RevocationSyncStatus {
  guildId: string;
  lastSyncAt?: number;
  lastAttemptAt?: number;
  currentVersion?: number;
  syncing: boolean;
  lastError?: string;
}

export const REVOCATION_STORAGE_KEYS = {
  REVOCATION_LIST: 'guildpass:revocation-list:v1:',
  REVOCATION_INDEX: 'guildpass:revocation-list-index:v1',
  SYNC_STATUS: 'guildpass:revocation-sync-status:v1',
} as const;

export const REVOCATION_DEFAULTS = {
  CACHE_TTL_MS: 15 * 60 * 1000,
  OFFLINE_TRUST_WINDOW_MS: 24 * 60 * 60 * 1000,
  MAX_LIST_SIZE: 10_000,
  FAIL_CLOSED: true,
  LIST_VALIDITY_MS: 7 * 24 * 60 * 60 * 1000,
} as const;

export const REVOCATION_ERROR_CODES = {
  INVALID_SIGNATURE: 'REVOCATION_INVALID_SIGNATURE',
  EXPIRED_LIST: 'REVOCATION_EXPIRED_LIST',
  VERSION_ROLLBACK: 'REVOCATION_VERSION_ROLLBACK',
  LIST_TOO_LARGE: 'REVOCATION_LIST_TOO_LARGE',
  CORRUPTED_DATA: 'REVOCATION_CORRUPTED_DATA',
  NETWORK_UNAVAILABLE: 'REVOCATION_NETWORK_UNAVAILABLE',
  CACHE_EXPIRED: 'REVOCATION_CACHE_EXPIRED',
  TRUST_WINDOW_EXCEEDED: 'REVOCATION_TRUST_WINDOW_EXCEEDED',
  UNKNOWN_AUTHORITY: 'REVOCATION_UNKNOWN_AUTHORITY',
} as const;

export type RevocationErrorCode = typeof REVOCATION_ERROR_CODES[keyof typeof REVOCATION_ERROR_CODES];

export class RevocationListError extends Error {
  constructor(
    public code: RevocationErrorCode,
    message: string,
    public details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'RevocationListError';
  }
}

export interface PortableAttestation {
  attestation: {
    guildId: string;
    roleId: string;
    wallet: string;
    issuedAt: number;
    expiresAt: number;
    signature: string;
  };
  issuerKey: {
    address?: string;
    publicKey?: string;
    keyId?: string;
  };
  revocationList: RevocationList;
  bundledAt: number;
  version: number;
}
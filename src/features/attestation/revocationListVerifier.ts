/**
 * Revocation list signature verification and validation
 */

import { verifyMessage, isAddress } from "viem";
import type { RevocationList, CachedRevocationList, RevocationCheckResult, RevocationVerificationContext } from "./revocationList.types";
import { RevocationListError, REVOCATION_ERROR_CODES, REVOCATION_DEFAULTS } from "./revocationList.types";

export async function verifyRevocationListSignature(
  list: RevocationList,
  authorityAddress: string
): Promise<{ valid: boolean; reason?: string }> {
  try {
    if (!isAddress(authorityAddress)) {
      return { valid: false, reason: `Invalid authority address: ${authorityAddress}` };
    }

    const message = createRevocationMessage(list);
    const isValid = await verifyMessage({
      address: authorityAddress,
      message,
      signature: list.signature as `0x${string}`,
    });

    return { valid: isValid };
  } catch (error) {
    return { valid: false, reason: String(error) };
  }
}

function createRevocationMessage(list: RevocationList): string {
  const sortedKeys = [...list.revokedKeys].sort((a, b) => {
    const addr = a.address.localeCompare(b.address);
    if (addr !== 0) return addr;
    return (a.keyId || '').localeCompare(b.keyId || '');
  });
  const payload = {
    guildId: list.guildId,
    version: list.version,
    issuedAt: list.issuedAt,
    expiresAt: list.expiresAt,
    revokedKeys: sortedKeys.map(k => ({
      ...(k.keyId && { keyId: k.keyId }),
      address: k.address.toLowerCase(),
      revokedAt: k.revokedAt,
    })),
  };
  return `GuildPass Revocation List v1\n${JSON.stringify(payload)}`;
}

export function validateRevocationListStructure(
  list: RevocationList,
  maxSize: number = REVOCATION_DEFAULTS.MAX_LIST_SIZE
): { valid: boolean; reason?: string } {
  if (!list.guildId || typeof list.guildId !== 'string') {
    return { valid: false, reason: 'Invalid or missing guildId' };
  }
  if (!Number.isInteger(list.version) || list.version < 0) {
    return { valid: false, reason: 'Invalid version number' };
  }
  if (!Number.isInteger(list.issuedAt) || list.issuedAt <= 0) {
    return { valid: false, reason: 'Invalid issuedAt timestamp' };
  }
  if (!Number.isInteger(list.expiresAt) || list.expiresAt <= list.issuedAt) {
    return { valid: false, reason: 'Invalid expiresAt timestamp' };
  }
  if (!Array.isArray(list.revokedKeys)) {
    return { valid: false, reason: 'revokedKeys must be an array' };
  }
  if (list.revokedKeys.length > maxSize) {
    return { valid: false, reason: `List too large: ${list.revokedKeys.length} > ${maxSize}` };
  }
  if (!list.signature || typeof list.signature !== 'string') {
    return { valid: false, reason: 'Invalid or missing signature' };
  }

  for (let i = 0; i < list.revokedKeys.length; i++) {
    const key = list.revokedKeys[i];
    if (!key.address || !isAddress(key.address)) {
      return { valid: false, reason: `Invalid address at index ${i}` };
    }
    if (!Number.isInteger(key.revokedAt) || key.revokedAt <= 0) {
      return { valid: false, reason: `Invalid revokedAt at index ${i}` };
    }
    if (key.keyId !== undefined && (typeof key.keyId !== 'string' || key.keyId.trim() === '')) {
      return { valid: false, reason: `Invalid keyId at index ${i}` };
    }
    if (key.reason !== undefined && !['compromised', 'rotation', 'admin', 'other'].includes(key.reason)) {
      return { valid: false, reason: `Invalid reason at index ${i}` };
    }
  }

  return { valid: true };
}

export function isRevocationListExpired(list: RevocationList, now: number = Date.now()): boolean {
  return now > list.expiresAt;
}

export function isWithinTrustWindow(
  cachedAt: number,
  now: number,
  trustWindowMs: number = REVOCATION_DEFAULTS.OFFLINE_TRUST_WINDOW_MS
): boolean {
  return (now - cachedAt) <= trustWindowMs;
}

export function isCacheFresh(
  cachedAt: number,
  now: number,
  ttlMs: number = REVOCATION_DEFAULTS.CACHE_TTL_MS
): boolean {
  return (now - cachedAt) <= ttlMs;
}

export function checkKeyRevocationStatus(
  cached: CachedRevocationList,
  context: RevocationVerificationContext,
  keyAddress?: string,
  keyId?: string
): RevocationCheckResult {
  const now = context.now;
  const config = context.config;

  if (isRevocationListExpired(cached.list, now)) {
    return { status: 'unavailable', reason: 'Revocation list expired', failClosed: true };
  }

  const cacheAge = now - cached.cachedAt;
  const isFresh = isCacheFresh(cached.cachedAt, now, config.cacheTtlMs);
  const withinTrustWindow = isWithinTrustWindow(cached.cachedAt, now, config.offlineTrustWindowMs);

  if (!isFresh && !withinTrustWindow) {
    return { 
      status: 'unavailable', 
      reason: `Revocation data stale: ${Math.round(cacheAge / 1000 / 60)} minutes`,
      failClosed: config.failClosed,
      dataAge: cacheAge,
    };
  }

  if (!cached.signatureVerified && !isFresh && config.failClosed) {
    return { status: 'unavailable', reason: 'Signature not verified', failClosed: true };
  }

  const isRevoked = cached.list.revokedKeys.some(revokedKey => {
    const addrMatch = keyAddress && revokedKey.address.toLowerCase() === keyAddress.toLowerCase();
    const kidMatch = keyId && revokedKey.keyId === keyId;
    return (keyAddress && !keyId && addrMatch) || (keyId && kidMatch);
  });

  if (isRevoked) {
    const revokedEntry = cached.list.revokedKeys.find(revokedKey => {
      const addrMatch = keyAddress && revokedKey.address.toLowerCase() === keyAddress.toLowerCase();
      const kidMatch = keyId && revokedKey.keyId === keyId;
      return (keyAddress && !keyId && addrMatch) || (keyId && kidMatch);
    });
    return { 
      status: 'revoked', 
      reason: `Key revoked at ${new Date(revokedEntry?.revokedAt || 0).toISOString()}${revokedEntry?.reason ? ` (${revokedEntry.reason})` : ''}`,
    };
  }

  return { status: 'valid', reason: isFresh ? 'Key not in fresh list' : 'Key not in cached list' };
}

export function validateVersionProgression(
  newVersion: number,
  currentVersion?: number
): { valid: boolean; reason?: string } {
  if (currentVersion === undefined) return { valid: true };
  if (newVersion <= currentVersion) {
    return { valid: false, reason: `Version rollback: ${newVersion} <= ${currentVersion}` };
  }
  return { valid: true };
}

export async function validateRevocationList(
  list: RevocationList,
  authorityAddress: string,
  currentVersion?: number,
  maxSize: number = REVOCATION_DEFAULTS.MAX_LIST_SIZE
): Promise<{ valid: boolean; reason?: string }> {
  const structure = validateRevocationListStructure(list, maxSize);
  if (!structure.valid) return structure;

  const version = validateVersionProgression(list.version, currentVersion);
  if (!version.valid) return version;

  if (isRevocationListExpired(list)) {
    return { valid: false, reason: 'Revocation list expired' };
  }

  const signature = await verifyRevocationListSignature(list, authorityAddress);
  if (!signature.valid) return signature;

  return { valid: true };
}
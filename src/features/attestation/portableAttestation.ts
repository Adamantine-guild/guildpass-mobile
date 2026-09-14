/**
 * Portable attestation bundling for offline third-party verification
 */

import type { RoleAttestation, RevocationList, PortableAttestation } from "./revocationList.types";
import { RevocationListError, REVOCATION_ERROR_CODES } from "./revocationList.types";
import { getCachedRevocationList } from "./revocationListCache";
import { getCachedIssuerKey } from "./issuerKeyRegistry";
import { validateRevocationList } from "./revocationListVerifier";
import { validateAttestation } from "./verifySignature";

export async function createPortableAttestation(
  attestation: RoleAttestation,
  options: {
    includePublicKey?: boolean;
    maxRevocationAge?: number;
  } = {}
): Promise<PortableAttestation> {
  const { includePublicKey = false, maxRevocationAge = 60 * 60 * 1000 } = options;

  const issuerKey = await getCachedIssuerKey(attestation.guildId);
  if (!issuerKey) {
    throw new RevocationListError(
      REVOCATION_ERROR_CODES.UNKNOWN_AUTHORITY,
      `No cached issuer key for guild ${attestation.guildId}`,
      { guildId: attestation.guildId }
    );
  }

  const cachedRevocation = await getCachedRevocationList(attestation.guildId);
  if (!cachedRevocation) {
    throw new RevocationListError(
      REVOCATION_ERROR_CODES.CACHE_EXPIRED,
      `No cached revocation list for guild ${attestation.guildId}`,
      { guildId: attestation.guildId }
    );
  }

  const revocationAge = Date.now() - cachedRevocation.cachedAt;
  if (revocationAge > maxRevocationAge) {
    throw new RevocationListError(
      REVOCATION_ERROR_CODES.CACHE_EXPIRED,
      `Revocation list too old: ${Math.round(revocationAge / 1000 / 60)} minutes`,
      { guildId: attestation.guildId, age: revocationAge, maxAge: maxRevocationAge }
    );
  }

  return {
    attestation: {
      guildId: attestation.guildId,
      roleId: attestation.roleId,
      wallet: attestation.wallet,
      issuedAt: attestation.issuedAt,
      expiresAt: attestation.expiresAt,
      signature: attestation.signature,
    },
    issuerKey: {
      address: issuerKey.issuerAddress,
      ...(includePublicKey && { publicKey: issuerKey.issuerAddress }),
      ...(attestation as any).kid && { keyId: (attestation as any).kid },
    },
    revocationList: cachedRevocation.list,
    bundledAt: Date.now(),
    version: 1,
  };
}

export async function verifyPortableAttestation(
  portable: PortableAttestation,
  chainId: number = 1
): Promise<{
  valid: boolean;
  reason?: string;
  attestationValid?: boolean;
  revocationValid?: boolean;
  keyRevoked?: boolean;
  expired?: boolean;
  bundleAge?: number;
}> {
  const now = Date.now();
  const bundleAge = now - portable.bundledAt;

  try {
    if (portable.version !== 1) {
      return { valid: false, reason: `Unsupported version: ${portable.version}`, bundleAge };
    }

    if (!portable.attestation || !portable.issuerKey || !portable.revocationList) {
      return { valid: false, reason: 'Incomplete portable attestation bundle', bundleAge };
    }

    const attestationExpired = now > portable.attestation.expiresAt;
    if (attestationExpired) {
      return { valid: false, reason: 'Attestation has expired', expired: true, bundleAge };
    }

    const revocationValidation = await validateRevocationList(
      portable.revocationList,
      portable.issuerKey.address,
      undefined,
      10000
    );

    if (!revocationValidation.valid) {
      return { 
        valid: false, 
        reason: `Invalid revocation list: ${revocationValidation.reason}`, 
        revocationValid: false,
        bundleAge,
      };
    }

    const keyRevoked = portable.revocationList.revokedKeys.some(revokedKey => {
      const addrMatch = revokedKey.address.toLowerCase() === portable.issuerKey.address?.toLowerCase();
      const kidMatch = portable.issuerKey.keyId && revokedKey.keyId === portable.issuerKey.keyId;
      return (portable.issuerKey.keyId && kidMatch) || (portable.issuerKey.address && addrMatch && !revokedKey.keyId);
    });

    if (keyRevoked) {
      const revokedEntry = portable.revocationList.revokedKeys.find(revokedKey => {
        const addrMatch = revokedKey.address.toLowerCase() === portable.issuerKey.address?.toLowerCase();
        const kidMatch = portable.issuerKey.keyId && revokedKey.keyId === portable.issuerKey.keyId;
        return (portable.issuerKey.keyId && kidMatch) || (portable.issuerKey.address && addrMatch && !revokedKey.keyId);
      });

      return { 
        valid: false, 
        reason: `Issuer key was revoked at ${new Date(revokedEntry?.revokedAt || 0).toISOString()}`,
        keyRevoked: true,
        revocationValid: true,
        bundleAge,
      };
    }

    const attestationResult = await validateAttestation(
      portable.attestation as RoleAttestation,
      portable.issuerKey.address as `0x${string}`,
      chainId
    );

    if (!attestationResult.valid) {
      return { 
        valid: false, 
        reason: `Attestation signature invalid: ${attestationResult.reason}`,
        attestationValid: false,
        revocationValid: true,
        bundleAge,
      };
    }

    return {
      valid: true,
      attestationValid: true,
      revocationValid: true,
      keyRevoked: false,
      expired: false,
      bundleAge,
    };

  } catch (error) {
    return {
      valid: false,
      reason: `Verification error: ${error instanceof Error ? error.message : String(error)}`,
      bundleAge,
    };
  }
}

export function createPortableAttestationQR(portable: PortableAttestation, compressionLevel: 'minimal' | 'standard' | 'full' = 'standard'): string {
  let payload: any;
  switch (compressionLevel) {
    case 'minimal':
      payload = {
        v: portable.version,
        a: {
          g: portable.attestation.guildId,
          r: portable.attestation.roleId,
          w: portable.attestation.wallet,
          i: portable.attestation.issuedAt,
          e: portable.attestation.expiresAt,
          s: portable.attestation.signature,
        },
        k: { a: portable.issuerKey.address, ...(portable.issuerKey.keyId && { k: portable.issuerKey.keyId }) },
        rl: {
          g: portable.revocationList.guildId,
          v: portable.revocationList.version,
          i: portable.revocationList.issuedAt,
          e: portable.revocationList.expiresAt,
          rk: portable.revocationList.revokedKeys.map(k => ({ a: k.address, ...(k.keyId && { k: k.keyId }), r: k.revokedAt })),
          s: portable.revocationList.signature,
        },
        b: portable.bundledAt,
      };
      break;
    case 'standard':
      payload = {
        version: portable.version,
        attestation: portable.attestation,
        issuerKey: portable.issuerKey,
        revocationList: {
          ...portable.revocationList,
          revokedKeys: portable.revocationList.revokedKeys.map(({ reason, ...k }) => k),
        },
        bundledAt: portable.bundledAt,
      };
      break;
    case 'full':
    default:
      payload = portable;
      break;
  }
  return `guildpass://portable/${Buffer.from(JSON.stringify(payload)).toString('base64')}`;
}

export function parsePortableAttestationQR(qrPayload: string): PortableAttestation {
  try {
    const prefix = 'guildpass://portable/';
    if (!qrPayload.startsWith(prefix)) {
      throw new Error('Invalid portable attestation QR format');
    }

    const base64Data = qrPayload.slice(prefix.length);
    const jsonStr = Buffer.from(base64Data, 'base64').toString('utf-8');
    const parsed = JSON.parse(jsonStr);

    if (parsed.v !== undefined) {
      return {
        version: parsed.v,
        attestation: {
          guildId: parsed.a.g,
          roleId: parsed.a.r,
          wallet: parsed.a.w,
          issuedAt: parsed.a.i,
          expiresAt: parsed.a.e,
          signature: parsed.a.s,
        },
        issuerKey: { address: parsed.k.a, ...(parsed.k.k && { keyId: parsed.k.k }) },
        revocationList: {
          guildId: parsed.rl.g,
          version: parsed.rl.v,
          issuedAt: parsed.rl.i,
          expiresAt: parsed.rl.e,
          revokedKeys: parsed.rl.rk.map((k: any) => ({ address: k.a, ...(k.k && { keyId: k.k }), revokedAt: k.r })),
          signature: parsed.rl.s,
        },
        bundledAt: parsed.b,
      };
    }

    return parsed as PortableAttestation;
  } catch (error) {
    throw new RevocationListError(
      REVOCATION_ERROR_CODES.CORRUPTED_DATA,
      `Failed to parse portable attestation QR: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}
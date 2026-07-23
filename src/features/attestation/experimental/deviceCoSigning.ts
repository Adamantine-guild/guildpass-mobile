/**
 * Device Co-Signing Prototype - EIP-712 Integration
 * 
 * EXPERIMENTAL - NOT FOR PRODUCTION USE
 * 
 * This module explores how device co-signing could integrate with the existing
 * EIP-712 attestation protocol. Due to curve incompatibility (P-256 vs secp256k1),
 * this prototype demonstrates a hybrid approach where device signatures complement
 * issuer signatures rather than replacing them.
 * 
 * See docs/device-signing-feasibility.md for the full feasibility analysis.
 */

import type { RoleAttestation } from '../types';

/**
 * Combined attestation with device co-signature
 * 
 * This extends the standard RoleAttestation with a device signature
 * that proves physical possession at presentation time.
 */
export interface DeviceCoSignedAttestation extends RoleAttestation {
  deviceSignature: {
    signature: string;        // P-256 signature (hex)
    publicKey: string;        // Device public key (hex)
    securityLevel: string;   // 'secure-enclave' | 'strongbox' | 'tee' | 'software'
    signedAt: number;        // Unix timestamp when device signed
  };
}

/**
 * Device co-signing verification result
 */
export interface DeviceCoSigningVerificationResult {
  valid: boolean;
  issuerValid: boolean;
  deviceValid: boolean;
  confidence: 'issuer-only' | 'device-co-signed' | 'device-invalid';
  reason?: string;
}

/**
 * Device Co-Signing Manager
 * 
 * Orchestrates the co-signing flow and verification of device signatures.
 */
export class DeviceCoSigningManager {
  /**
   * Co-sign an existing issuer attestation with a device signature
   * 
   * @param attestation - The issuer-signed attestation
   * @param deviceSignFn - Function to sign with device key (would use expo-hardware-key)
   * @returns The co-signed attestation
   */
  async coSignAttestation(
    attestation: RoleAttestation,
    deviceSignFn: (data: Uint8Array) => Promise<{ signature: Uint8Array; publicKey: Uint8Array; securityLevel: string }>
  ): Promise<DeviceCoSignedAttestation> {
    // Create the payload to sign (attestation hash + timestamp)
    const payload = this.createCoSigningPayload(attestation);
    
    // Sign with device key
    const { signature, publicKey, securityLevel } = await deviceSignFn(payload);
    
    return {
      ...attestation,
      deviceSignature: {
        signature: this.uint8ArrayToHex(signature),
        publicKey: this.uint8ArrayToHex(publicKey),
        securityLevel,
        signedAt: Math.floor(Date.now() / 1000),
      },
    };
  }

  /**
   * Verify a co-signed attestation
   * 
   * @param coSignedAttestation - The co-signed attestation to verify
   * @param issuerVerifyFn - Function to verify issuer signature (existing viem flow)
   * @param deviceVerifyFn - Function to verify device signature (P-256 verification)
   * @returns Verification result
   */
  async verifyCoSignedAttestation(
    coSignedAttestation: DeviceCoSignedAttestation,
    issuerVerifyFn: (attestation: RoleAttestation) => Promise<boolean>,
    deviceVerifyFn: (signature: string, publicKey: string, data: Uint8Array) => Promise<boolean>
  ): Promise<DeviceCoSigningVerificationResult> {
    // Verify issuer signature (existing flow)
    const issuerValid = await issuerVerifyFn(coSignedAttestation);
    
    // Verify device signature
    const payload = this.createCoSigningPayload(coSignedAttestation);
    const deviceValid = await deviceVerifyFn(
      coSignedAttestation.deviceSignature.signature,
      coSignedAttestation.deviceSignature.publicKey,
      payload
    );
    
    // Determine overall confidence
    let confidence: DeviceCoSigningVerificationResult['confidence'];
    let reason: string | undefined;
    
    if (issuerValid && deviceValid) {
      confidence = 'device-co-signed';
    } else if (issuerValid && !deviceValid) {
      confidence = 'device-invalid';
      reason = 'Issuer signature valid but device signature invalid';
    } else if (!issuerValid && deviceValid) {
      confidence = 'device-invalid';
      reason = 'Device signature valid but issuer signature invalid';
    } else {
      confidence = 'issuer-only';
      reason = 'Both signatures invalid';
    }
    
    return {
      valid: issuerValid, // Primary validity based on issuer signature
      issuerValid,
      deviceValid,
      confidence,
      reason,
    };
  }

  /**
   * Create the payload for device co-signing
   * 
   * The payload includes the attestation hash and a timestamp to prevent replay.
   */
  private createCoSigningPayload(attestation: RoleAttestation): Uint8Array {
    const data = {
      guildId: attestation.guildId,
      roleId: attestation.roleId,
      wallet: attestation.wallet,
      issuedAt: attestation.issuedAt,
      expiresAt: attestation.expiresAt,
      issuerSignature: attestation.signature,
      timestamp: Math.floor(Date.now() / 1000),
    };
    
    const str = JSON.stringify(data);
    const encoder = new TextEncoder();
    return encoder.encode(str);
  }

  /**
   * Convert Uint8Array to hex string
   */
  private uint8ArrayToHex(bytes: Uint8Array): string {
    return Array.from(bytes)
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
  }

  /**
   * Convert hex string to Uint8Array
   */
  private hexToUint8Array(hex: string): Uint8Array {
    const cleanHex = hex.startsWith('0x') ? hex.slice(2) : hex;
    const bytes = new Uint8Array(cleanHex.length / 2);
    for (let i = 0; i < cleanHex.length; i += 2) {
      bytes[i / 2] = parseInt(cleanHex.substr(i, 2), 16);
    }
    return bytes;
  }

  /**
   * Check if an attestation has a device co-signature
   */
  hasDeviceSignature(attestation: any): attestation is DeviceCoSignedAttestation {
    return attestation.deviceSignature !== undefined &&
           typeof attestation.deviceSignature.signature === 'string' &&
           typeof attestation.deviceSignature.publicKey === 'string';
  }

  /**
   * Extract the device signature for display/verification
   */
  extractDeviceSignature(attestation: DeviceCoSignedAttestation) {
    return {
      signature: attestation.deviceSignature.signature,
      publicKey: attestation.deviceSignature.publicKey,
      securityLevel: attestation.deviceSignature.securityLevel,
      signedAt: attestation.deviceSignature.signedAt,
      age: Math.floor(Date.now() / 1000) - attestation.deviceSignature.signedAt,
    };
  }
}

/**
 * Prototype: EIP-712 typed data for device attestations
 * 
 * This demonstrates how a separate EIP-712 schema could be defined
 * for device-specific attestations using the P-256 curve.
 * 
 * NOTE: This is a separate schema from the issuer attestations and would
 * require its own verification flow. This is Option C from the feasibility doc.
 */

export const DEVICE_ATTESTATION_EIP712_DOMAIN = {
  name: 'GuildPassDevice',
  version: '1.0',
  chainId: 1, // Would match the guild's chain
  verifyingContract: '0x0000000000000000000000000000000000000000',
};

export const DEVICE_ATTESTATION_EIP712_TYPES = {
  DeviceAttestation: [
    { name: 'guildId', type: 'string' },
    { name: 'roleId', type: 'string' },
    { name: 'wallet', type: 'address' },
    { name: 'devicePublicKey', type: 'string' },
    { name: 'timestamp', type: 'uint256' },
  ],
};

export interface DeviceAttestationMessage {
  guildId: string;
  roleId: string;
  wallet: string;
  devicePublicKey: string;
  timestamp: number;
}

/**
 * Create a device-specific attestation (Option C approach)
 * 
 * This would be a separate attestation format from issuer attestations,
 * specifically designed for device-signed proofs using P-256.
 */
export function createDeviceAttestation(
  message: DeviceAttestationMessage,
  signFn: (typedData: any) => Promise<string>
): Promise<DeviceAttestationMessage & { signature: string }> {
  const typedData = {
    domain: DEVICE_ATTESTATION_EIP712_DOMAIN,
    types: DEVICE_ATTESTATION_EIP712_TYPES,
    primaryType: 'DeviceAttestation' as const,
    message,
  };

  return signFn(typedData).then(signature => ({
    ...message,
    signature,
  }));
}

/**
 * Verify a device-specific attestation
 * 
 * This would use P-256 signature verification (not secp256k1).
 * NOTE: viem does not support P-256, so this would require a different library.
 */
export async function verifyDeviceAttestation(
  attestation: DeviceAttestationMessage & { signature: string },
  devicePublicKey: string
): Promise<boolean> {
  // In production, this would use a P-256 verification library
  // viem only supports secp256k1, so this is a placeholder
  
  console.log('[DeviceAttestation] Verifying device attestation', {
    devicePublicKey,
    signature: attestation.signature,
  });

  // Prototype simulation
  return true;
}

// Export singleton for prototype testing
export const deviceCoSigningManager = new DeviceCoSigningManager();

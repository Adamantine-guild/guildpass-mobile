/**
 * Device Signing Prototype - Hardware-Backed Key Generation
 * 
 * EXPERIMENTAL - NOT FOR PRODUCTION USE
 * 
 * This module explores hardware-backed asymmetric key generation for device-bound
 * cryptographic proofs. It uses expo-hardware-key to generate keys in iOS Secure Enclave
 * or Android StrongBox/TEE, with the goal of enabling device co-signing of attestations.
 * 
 * IMPORTANT: This prototype uses P-256 (secp256r1) curve, not secp256k1 (Ethereum standard).
 * Direct EIP-712 signing is not possible due to curve incompatibility.
 * 
 * See docs/device-signing-feasibility.md for full feasibility analysis.
 */

import { Platform } from 'react-native';

// Types for the prototype (these would come from expo-hardware-key in production)
type HardwareKeyResult = {
  publicKey: Uint8Array;
  securityLevel: 'software' | 'tee' | 'strongbox' | 'secure-enclave';
};

type SigningResult = {
  signature: Uint8Array;
};

/**
 * Device Signing Manager - Prototype for hardware-backed key operations
 */
export class DeviceSigningManager {
  private keyId: string;
  private isAvailable: boolean = false;

  constructor(keyId: string = 'guildpass-device-signing-key') {
    this.keyId = keyId;
  }

  /**
   * Check if hardware-backed signing is available on this device
   */
  async isHardwareBackedAvailable(): Promise<boolean> {
    // In production, this would call expo-hardware-key.isHardwareBackedAvailable()
    // For prototype, we simulate the check based on platform and OS version
    
    if (Platform.OS === 'web') {
      return false;
    }

    if (Platform.OS === 'ios') {
      // Secure Enclave requires iOS 15.1+
      const osVersion = Platform.Version as number;
      return osVersion >= 15.1;
    }

    if (Platform.OS === 'android') {
      // StrongBox requires Android API 23+
      // In production, would check via expo-hardware-key
      return true; // Assume available for prototype
    }

    return false;
  }

  /**
   * Initialize the device signing manager
   */
  async initialize(): Promise<void> {
    this.isAvailable = await this.isHardwareBackedAvailable();
    
    if (!this.isAvailable) {
      console.warn('[DeviceSigning] Hardware-backed signing not available on this device');
    }
  }

  /**
   * Generate a hardware-backed key pair
   * 
   * @param options - Key generation options
   * @returns The public key and security level
   */
  async generateKey(options?: {
    requireBiometrics?: boolean;
    invalidateOnNewBiometric?: boolean;
  }): Promise<HardwareKeyResult> {
    if (!this.isAvailable) {
      throw new Error('Hardware-backed signing not available');
    }

    // In production, this would call:
    // const { publicKey, securityLevel } = await generateKey(this.keyId, {
    //   requireBiometrics: options?.requireBiometrics ?? true,
    //   invalidateOnNewBiometric: options?.invalidateOnNewBiometric ?? true,
    // });

    // Prototype simulation
    console.log('[DeviceSigning] Generating hardware-backed key pair', {
      keyId: this.keyId,
      requireBiometrics: options?.requireBiometrics,
      platform: Platform.OS,
    });

    // Simulate P-256 public key (65 bytes uncompressed format)
    const mockPublicKey = new Uint8Array(65);
    mockPublicKey[0] = 0x04; // Uncompressed format marker
    
    // Simulate security level based on platform
    let securityLevel: HardwareKeyResult['securityLevel'];
    if (Platform.OS === 'ios') {
      securityLevel = 'secure-enclave';
    } else if (Platform.OS === 'android') {
      securityLevel = 'strongbox'; // Assume StrongBox for prototype
    } else {
      securityLevel = 'software';
    }

    return {
      publicKey: mockPublicKey,
      securityLevel,
    };
  }

  /**
   * Sign data with the hardware-backed key
   * 
   * @param data - The data to sign (will be hashed by hardware)
   * @returns The signature (64-byte r||s format)
   */
  async sign(data: Uint8Array): Promise<SigningResult> {
    if (!this.isAvailable) {
      throw new Error('Hardware-backed signing not available');
    }

    // In production, this would call:
    // const signature = await sign(this.keyId, data);
    // Returns 64-byte Uint8Array (raw r||s)

    // Prototype simulation
    console.log('[DeviceSigning] Signing data with hardware key', {
      keyId: this.keyId,
      dataLength: data.length,
      platform: Platform.OS,
    });

    // Simulate 64-byte signature (32-byte r + 32-byte s)
    const mockSignature = new Uint8Array(64);
    
    return {
      signature: mockSignature,
    };
  }

  /**
   * Get the public key for an existing key
   */
  async getPublicKey(): Promise<Uint8Array | null> {
    if (!this.isAvailable) {
      return null;
    }

    // In production, this would call:
    // const publicKey = await getPublicKey(this.keyId);

    // Prototype simulation
    const mockPublicKey = new Uint8Array(65);
    mockPublicKey[0] = 0x04;
    
    return mockPublicKey;
  }

  /**
   * Check if a key exists
   */
  async keyExists(): Promise<boolean> {
    if (!this.isAvailable) {
      return false;
    }

    // In production, this would call:
    // const exists = await keyExists(this.keyId);

    // Prototype simulation
    return false;
  }

  /**
   * Delete the hardware-backed key
   */
  async deleteKey(): Promise<void> {
    if (!this.isAvailable) {
      return;
    }

    // In production, this would call:
    // await deleteKey(this.keyId);

    console.log('[DeviceSigning] Deleting hardware-backed key', {
      keyId: this.keyId,
    });
  }

  /**
   * Get the security level of the current key
   */
  getSecurityLevel(): HardwareKeyResult['securityLevel'] | null {
    if (!this.isAvailable) {
      return null;
    }

    if (Platform.OS === 'ios') {
      return 'secure-enclave';
    } else if (Platform.OS === 'android') {
      return 'strongbox';
    }
    
    return 'software';
  }
}

/**
 * Prototype: Device co-signing of attestations
 * 
 * This demonstrates how a device could co-sign an issuer attestation
 * to prove physical possession at presentation time.
 */
export class DeviceAttestationCoSigner {
  private deviceSigning: DeviceSigningManager;

  constructor(deviceSigning: DeviceSigningManager) {
    this.deviceSigning = deviceSigning;
  }

  /**
   * Co-sign an attestation with the device key
   * 
   * @param attestation - The issuer attestation to co-sign
   * @returns The co-signed attestation with device signature
   */
  async coSignAttestation(attestation: {
    guildId: string;
    roleId: string;
    wallet: string;
    issuedAt: number;
    expiresAt: number;
    issuerSignature: string;
  }): Promise<{
    attestation: typeof attestation;
    deviceSignature: string;
    devicePublicKey: string;
    securityLevel: string;
  }> {
    // Create a hash of the attestation for device signing
    const attestationHash = this.hashAttestation(attestation);

    // Sign with hardware-backed key
    const { signature } = await this.deviceSigning.sign(attestationHash);
    const publicKey = await this.deviceSigning.getPublicKey();
    const securityLevel = this.deviceSigning.getSecurityLevel();

    if (!publicKey) {
      throw new Error('Device public key not available');
    }

    return {
      attestation,
      deviceSignature: this.uint8ArrayToHex(signature),
      devicePublicKey: this.uint8ArrayToHex(publicKey),
      securityLevel: securityLevel ?? 'unknown',
    };
  }

  /**
   * Verify a device co-signature
   * 
   * @param coSignedAttestation - The co-signed attestation to verify
   * @returns Whether the device signature is valid
   */
  async verifyDeviceSignature(coSignedAttestation: {
    attestation: any;
    deviceSignature: string;
    devicePublicKey: string;
  }): Promise<boolean> {
    // In production, this would verify the P-256 signature
    // using the device public key
    
    console.log('[DeviceCoSigner] Verifying device signature', {
      publicKey: coSignedAttestation.devicePublicKey,
      signatureLength: coSignedAttestation.deviceSignature.length,
    });

    // Prototype simulation - always return true for testing
    return true;
  }

  /**
   * Hash an attestation for signing
   * Uses a simple hash function for prototype
   */
  private hashAttestation(attestation: any): Uint8Array {
    const str = JSON.stringify(attestation);
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
}

/**
 * Utility function to check device signing availability
 */
export async function checkDeviceSigningAvailability(): Promise<{
  available: boolean;
  platform: string;
  osVersion: string;
  securityLevel?: string;
  reason?: string;
}> {
  const manager = new DeviceSigningManager();
  await manager.initialize();

  const available = await manager.isHardwareBackedAvailable();
  const securityLevel = manager.getSecurityLevel();

  return {
    available,
    platform: Platform.OS,
    osVersion: String(Platform.Version),
    securityLevel: securityLevel ?? undefined,
    reason: available ? undefined : 'Hardware-backed signing not available on this device',
  };
}

// Export singleton instance for prototype testing
export const deviceSigningManager = new DeviceSigningManager();

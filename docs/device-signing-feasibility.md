# Device Signing Feasibility Investigation

## Overview

This document investigates the feasibility of implementing hardware-backed asymmetric key generation on mobile devices for co-signing role attestations. The goal is to enable device-bound cryptographic proofs that strengthen the presentation-time trust model for offline/portable attestation verification.

## Current State

### Existing Crypto Infrastructure

The app currently uses:
- **expo-secure-store** (v12.8.1) - Stores symmetric AES-256 encryption keys via KeyManager
- **expo-crypto** (v12.8.1) - Provides hashing and AES encryption/decryption
- **viem** (v2.55.2) - Ethereum library with EIP-712 signing capabilities (software-based)
- **expo-local-authentication** (v57.0.1) - Biometric authentication for UI gates

**Key Limitation**: The current stack has no hardware-backed asymmetric key generation capability. All signing operations (if any) are software-based and the private keys would be extractable.

### Current Attestation Model

Per `docs/ATTESTATION_PROTOCOL.md`:
- Attestations are issuer-signed only (guild backend signs role claims)
- Mobile app only verifies signatures, never creates them
- No device-side signing capability exists
- Trust model: "the issuer said this wallet has this role"

## Research Findings

### expo-secure-store Capabilities

**Finding**: expo-secure-store does **NOT** support asymmetric key generation.

- Only supports symmetric key storage (key-value pairs)
- Uses iOS Keychain as `kSecClassGenericPassword` 
- Android uses encrypted SharedPreferences/Keystore for symmetric keys only
- No API for generating or storing asymmetric key pairs
- No API for signing operations with stored keys

**Conclusion**: expo-secure-store alone is insufficient for hardware-backed asymmetric key operations.

### Hardware-Backed Key Generation Options

#### Option 1: expo-device-crypto

**Library**: `expo-device-crypto` by piotr-pietras

**Capabilities**:
- Hardware-backed asymmetric key generation
- iOS Secure Enclave support for ECDSA keys
- Android StrongBox/TEE support with `preferStrongBox` option
- Algorithms: ECDSA_SECP256R1_SHA256, RSA variants, ECIES
- Signing operations with biometric authentication
- Key lifecycle management (generate, sign, delete, check existence)

**Platform Support**:
| Platform | Hardware | Min Version | Algorithm Support |
|----------|----------|-------------|-------------------|
| iOS | Secure Enclave | 15.1 | ECDSA P-256 only for Secure Enclave |
| Android | StrongBox/TEE | API 23 | ECDSA P-256, RSA 2048, AES, HMAC |

**API Example**:
```typescript
import DeviceCrypto, { SigningAlgorithm } from "expo-device-crypto";

// Generate hardware-backed key pair
const alias = "device-signing-key";
const hasStrongBox = DeviceCrypto.isStrongBoxAvailable();

await DeviceCrypto.generateKeyPair(alias, {
  algorithmType: SigningAlgorithm.ECDSA_SECP256R1_SHA256,
  preferStrongBox: true,
  requireAuthentication: true,
});

// Sign data
const signature = await DeviceCrypto.sign(alias, data, {
  algorithmType: SigningAlgorithm.ECDSA_SECP256R1_SHA256,
  promptTitle: "Sign attestation",
  authMethod: "PASSCODE_OR_BIOMETRIC",
});
```

**Pros**:
- Mature library with active maintenance
- Comprehensive crypto operations (signing, encryption, key exchange)
- StrongBox support on Android
- Biometric authentication integration
- Expo config plugin available

**Cons**:
- Uses P-256 (secp256r1) curve, not secp256k1 (Ethereum standard)
- May require native module installation
- Authentication policy differences between iOS (creation-time) and Android (usage-time)

#### Option 2: expo-hardware-key

**Library**: `expo-hardware-key` by brian7989

**Capabilities**:
- Focused on P-256 key generation and ECDSA signing
- Private keys never leave hardware
- iOS Secure Enclave / Android StrongBox / TEE
- Simple API surface (generate, sign, getPublicKey, deleteKey, keyExists)
- Hardware availability detection

**Platform Support**:
| Platform | Hardware | Min Version |
|----------|----------|-------------|
| iOS | Secure Enclave | 15.1 |
| Android | StrongBox / TEE | API 23 |

**API Example**:
```typescript
import { generateKey, sign, getPublicKey, keyExists, deleteKey } from 'expo-hardware-key';

// Generate hardware-backed key
const { publicKey, securityLevel } = await generateKey('user-key', {
  requireBiometrics: true,
  invalidateOnNewBiometric: true,
});

// Sign data (hardware does SHA-256)
const signature = await sign('user-key', data);
// Returns 64-byte Uint8Array (raw r||s)
```

**Pros**:
- Simpler, focused API
- Designed specifically for hardware-backed signing
- Clear security level reporting
- Biometric prompt customization

**Cons**:
- Only P-256 curve (secp256r1), not secp256k1
- Less mature than expo-device-crypto
- Fewer crypto operations (signing only)
- May require native module installation

#### Option 3: react-native-passkeys

**Library**: `react-native-passkeys` by peterferguson

**Capabilities**:
- WebAuthn/Passkeys implementation
- Hardware-backed keys via platform authenticators
- iOS 15.0+, Android API 28+
- Expo SDK 50+ compatibility

**Platform Support**:
| Platform | Hardware | Min Version |
|----------|----------|-------------|
| iOS | Secure Enclave | 15.0 |
| Android | StrongBox / TEE | 28 |

**Pros**:
- Standard WebAuthn protocol
- Well-maintained, Expo SDK 50 compatible
- Platform authenticator integration

**Cons**:
- Designed for authentication, not general signing
- FIDO2 attestation format, not EIP-712
- Would require protocol adaptation
- Overhead of WebAuthn challenge/response flow

### Curve Compatibility Issue

**Critical Finding**: Both hardware-backed libraries use P-256 (secp256r1), not secp256k1 (Ethereum's standard curve).

**Ethereum Context**:
- Ethereum uses secp256k1 (Koblitz curve) for all signatures
- EIP-712 signatures expect secp256k1
- viem and other Ethereum libraries only support secp256k1
- Hardware Secure Enclaves typically support P-256 (NIST curve) for compliance reasons

**Implications**:
1. **Direct EIP-712 signing not possible** with hardware-backed keys
2. **Workaround options**:
   - Use a hybrid scheme: device signs with P-256, verifier converts/validates
   - Use a separate attestation format specifically for device signatures
   - Accept software-based secp256k1 signing (defeats hardware security purpose)
   - Use hardware key for a different purpose (e.g., encrypting the secp256k1 key)

## Feasibility Assessment

### Technical Feasibility: PARTIAL

**What's Achievable**:
- ✅ Hardware-backed asymmetric key generation is possible via expo-device-crypto or expo-hardware-key
- ✅ iOS Secure Enclave integration is feasible
- ✅ Android StrongBox/TEE integration is feasible
- ✅ Biometric authentication can be required for signing operations
- ✅ Keys can be made non-extractable (never leave hardware)

**What's Not Achievable**:
- ❌ Direct EIP-712 signing with hardware-backed keys (curve mismatch)
- ❌ Using expo-secure-store for asymmetric operations
- ❌ Native Expo SDK primitives for hardware-backed asymmetric keys (requires external library)

### Platform Differences

| Aspect | iOS | Android |
|--------|-----|---------|
| Hardware | Secure Enclave | StrongBox / TEE |
| Min Version | 15.1 | API 23 |
| Curve Support | P-256 only for Secure Enclave | P-256, RSA, AES, HMAC |
| Auth Policy | Bound at key creation | Applied at key usage |
| Fallback | Software-backed if Secure Enclave unavailable | TEE if StrongBox unavailable |
| Availability Check | Device capability detection | `isStrongBoxAvailable()` method |

### Integration Complexity

**Low Complexity**:
- Adding expo-hardware-key dependency
- Simple key generation and signing API
- Hardware availability detection

**Medium Complexity**:
- Adding expo-device-crypto dependency
- Config plugin installation
- Platform-specific authentication policy handling

**High Complexity**:
- Curve compatibility workaround (P-256 vs secp256k1)
- EIP-712 integration with non-standard signatures
- Verification flow changes to accept alternative signature formats
- Protocol extension for device co-signing

## Recommended Approach

### Option A: Hybrid Device Attestation (Recommended)

**Concept**: Device signs the attestation hash with P-256 hardware key, creating a "device presentation proof" that co-exists with the issuer's secp256k1 signature.

**Flow**:
1. Issuer signs attestation with secp256k1 (existing flow)
2. Device receives attestation and hashes it
3. Device signs the hash with P-256 hardware key
4. Combined proof: { issuerSignature, deviceSignature, devicePublicKey }
5. Verifier validates both signatures independently

**Pros**:
- Leverages hardware security for device binding
- Doesn't break existing EIP-712 issuer attestations
- Clear separation of concerns (issuer vs device)
- Fallback graceful (device signature optional)

**Cons**:
- Requires protocol extension
- Verification complexity increases
- Two signature formats to manage

### Option B: Hardware-Protected secp256k1 Key

**Concept**: Use hardware key to encrypt/protect a software-based secp256k1 key.

**Flow**:
1. Generate secp256k1 key pair in software
2. Encrypt private key with hardware-backed P-256 key
3. Store encrypted key in secure storage
4. To sign: decrypt with hardware key, then sign with secp256k1
5. Hardware key requires biometric authentication for decryption

**Pros**:
- Enables EIP-712 signing with secp256k1
- Hardware protection for private key material
- No protocol changes needed

**Cons**:
- Private key exists in memory during signing (vulnerability window)
- More complex key management
- Defeats some benefits of non-extractable hardware keys

### Option C: Alternative Attestation Format

**Concept**: Create a new attestation format specifically for device-signed proofs using P-256.

**Flow**:
1. Define new EIP-712-like format for device attestations
2. Device signs with P-256 hardware key
3. Separate verification flow for device attestations
4. Issuer attestations remain unchanged

**Pros**:
- Clean separation of issuer vs device attestations
- Leverages hardware security directly
- No curve compatibility workarounds

**Cons**:
- Requires new protocol specification
- Verification infrastructure changes
- Ecosystem adoption needed

## Implementation Recommendation

### Phase 1: Feasibility Prototype (Current Branch)

**Goal**: Validate hardware-backed key generation and signing with expo-hardware-key.

**Scope**:
- Install expo-hardware-key dependency
- Create isolated prototype module (`src/features/attestation/experimental/deviceSigning.ts`)
- Implement key generation, signing, and verification
- Test on physical devices (iOS 15.1+, Android API 23+)
- Document platform differences and limitations
- **Do not integrate with production attestation flow**

**Acceptance Criteria**:
- Successfully generate hardware-backed key pair on both platforms
- Successfully sign data with hardware key
- Verify signature with corresponding public key
- Detect hardware availability accurately
- Handle biometric authentication prompts
- Document curve compatibility limitations

### Phase 2: Protocol Design (If Phase 1 Succeeds)

**Goal**: Design the co-signing protocol and integration approach.

**Scope**:
- Choose between Option A, B, or C
- Design the combined attestation format
- Define verification flow
- Update ATTESTATION_PROTOCOL.md with device signing section
- Security review of the proposed approach

### Phase 3: Production Integration (If Approved)

**Goal**: Integrate device signing into the main attestation flow.

**Scope**:
- Implement chosen approach
- Update verification pipeline
- Add UI for device key management
- Handle fallback scenarios
- Update access decision confidence levels
- Comprehensive testing

## Dependencies and Installation

### expo-hardware-key Installation

```bash
npm install expo-hardware-key
```

No config plugin required (uses native modules directly).

### expo-device-crypto Installation

```bash
npm install expo-device-crypto
```

May require config plugin for platform-specific settings.

## Security Considerations

### Hardware Security Benefits

- **Non-extractable keys**: Private keys never leave hardware
- **Biometric binding**: Signing requires user presence
- **Device binding**: Keys tied to specific device
- **Tamper resistance**: Hardware protections against extraction

### Remaining Attack Vectors

- **Memory exposure**: Private key material in memory during operations (Option B)
- **Biometric bypass**: Spoofed biometrics on some devices
- **Device compromise**: Physical access to unlocked device
- **Protocol attacks**: Replay, man-in-the-middle (mitigated by existing attestations)

### Key Lifecycle

- **Generation**: One-time per device
- **Rotation**: On device compromise or biometric changes
- **Deletion**: On app uninstall or user request
- **Backup**: Not possible (hardware-bound by design)

## Conclusion

**Feasibility**: Hardware-backed asymmetric key generation is **technically feasible** using external libraries (expo-hardware-key or expo-device-crypto), but **direct EIP-712 integration is not feasible** due to curve compatibility (P-256 vs secp256k1).

**Recommended Path**: 
1. Build Phase 1 prototype with expo-hardware-key to validate hardware key operations
2. Evaluate Option A (Hybrid Device Attestation) for protocol integration
3. If hardware security is critical, consider Option B (Hardware-Protected secp256k1) despite trade-offs
4. Defer production integration until protocol design is approved

**Blockers**:
- Curve incompatibility (P-256 vs secp256k1) requires protocol-level workaround
- External library dependency adds maintenance burden
- Platform differences require careful testing and handling

**Next Steps**:
1. Implement Phase 1 prototype on hardware-backed branch
2. Test on physical iOS and Android devices
3. Document findings and limitations
4. Present to maintainers for protocol design decision

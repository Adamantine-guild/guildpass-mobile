import { ec as EC } from "elliptic";
import { keccak256 } from "js-sha3";
import { ACCESS_QR_TYPE, ACCESS_QR_VERSION } from "./qrConstants";

/**
 * QR payload signature verification.
 *
 * The guild's access-issuing backend signs each QR payload with its published
 * issuer key (a secp256k1 keypair). The app verifies that signature against the
 * guild's public key before trusting the payload, in addition to the existing
 * structural / expiry checks.
 *
 * Signing scheme
 * --------------
 * The message that is signed is a deterministic, newline-delimited
 * canonicalization of every payload field EXCEPT `signature`:
 *
 *   type\nversion\nguildId\nresourceId\nwalletAddress\nexpiresAt
 *
 *   - `walletAddress` / `expiresAt` use the empty string when absent.
 *   - Strings are NOT trimmed before signing so the signer and verifier agree
 *     byte-for-byte on the exact bytes that were signed.
 *
 * That message is hashed with keccak256 and signed with the issuer's
 * secp256k1 private key. The resulting signature is DER-encoded and hex-
 * serialized into the payload's `signature` field (lower-case hex, with or
 * without a leading `0x`).
 *
 * This matches the Web3 convention used by the rest of the GuildPass stack
 * (ethers / viem / js-sha3) and keeps the verification path pure-JS so it runs
 * identically in Node (tests) and React Native.
 */

export const QR_SIGNATURE_ERROR_CODES = {
  MISSING_SIGNATURE: "QR_SIGNATURE_MISSING",
  INVALID_SIGNATURE_FORMAT: "QR_SIGNATURE_FORMAT_INVALID",
  VERIFICATION_FAILED: "QR_SIGNATURE_VERIFICATION_FAILED",
  PUBLIC_KEY_UNAVAILABLE: "QR_SIGNATURE_PUBLIC_KEY_UNAVAILABLE",
  REVOKED_KEY: "QR_KEY_REVOKED",
  UNKNOWN_KEY: "QR_KEY_UNKNOWN",
  MISSING_KID: "QR_KID_MISSING",
  KEY_REGISTRY_EXPIRED: "QR_KEY_REGISTRY_EXPIRED",
} as const;

export type QrSignatureErrorCode =
  (typeof QR_SIGNATURE_ERROR_CODES)[keyof typeof QR_SIGNATURE_ERROR_CODES];

export class QrSignatureError extends Error {
  readonly code: QrSignatureErrorCode;

  constructor(code: QrSignatureErrorCode, message: string) {
    super(message);
    this.name = "QrSignatureError";
    this.code = code;
  }
}

const QR_SIGNATURE_ERROR_MESSAGES: Record<QrSignatureErrorCode, string> = {
  [QR_SIGNATURE_ERROR_CODES.MISSING_SIGNATURE]:
    "This QR code is missing its security signature. Ask the guild admin to issue a new code.",
  [QR_SIGNATURE_ERROR_CODES.INVALID_SIGNATURE_FORMAT]:
    "The QR code signature is malformed. Re-scan the code or ask the guild admin for a fresh one.",
  [QR_SIGNATURE_ERROR_CODES.VERIFICATION_FAILED]:
    "The QR code signature could not be verified. Do not use this code; ask the guild admin for a fresh one.",
  [QR_SIGNATURE_ERROR_CODES.PUBLIC_KEY_UNAVAILABLE]:
    "The guild issuer key is unavailable. Try again later or contact the guild admin.",
  [QR_SIGNATURE_ERROR_CODES.REVOKED_KEY]:
    "This QR code was signed with a revoked guild key. Contact the guild admin for a new code.",
  [QR_SIGNATURE_ERROR_CODES.UNKNOWN_KEY]:
    "This QR code was signed by an unknown guild key. Contact the guild admin before using it.",
  [QR_SIGNATURE_ERROR_CODES.MISSING_KID]:
    "This QR code is missing its key identifier. Ask the guild admin to reissue it.",
  [QR_SIGNATURE_ERROR_CODES.KEY_REGISTRY_EXPIRED]:
    "The guild key registry is stale. Reconnect to the internet and scan again.",
};

export const describeQrSignatureError = (code: QrSignatureErrorCode): string =>
  QR_SIGNATURE_ERROR_MESSAGES[code];

const ec = new EC("secp256k1");

export type SignableQrPayload = {
  guildId: string;
  resourceId: string;
  walletAddress?: string;
  expiresAt?: string;
  kid?: string;
};

/**
 * Build the exact byte string that the issuer signs / the verifier checks.
 * `type` and `version` are pinned to the canonical constants (not read from the
 * payload) so a fabricated payload cannot vary them to dodge verification.
 * Order and field set are part of the wire contract — do NOT reorder, rename,
 * or trim. Changing this function is a breaking change for every issued QR.
 */
export const buildSigningMessage = (payload: SignableQrPayload): string =>
  [
    ACCESS_QR_TYPE,
    String(ACCESS_QR_VERSION),
    payload.guildId,
    payload.resourceId,
    payload.walletAddress ?? "",
    payload.expiresAt ?? "",
    payload.kid ?? "",
  ].join("\n");

const stripHexPrefix = (value: string): string =>
  value.startsWith("0x") || value.startsWith("0X") ? value.slice(2) : value;

const isValidHex = (value: string): boolean => /^[0-9a-fA-F]*$/.test(value);

/**
 * Verify a payload's `signature` against the guild issuer's public key.
 *
 * @throws {QrSignatureError} with a specific code when the payload is unsigned,
 *         the signature is malformed, or verification fails. The caller (parse
 *         flow) decides whether a thrown error is fatal based on the feature
 *         flag.
 */
export const verifyQrSignature = (
  payload: SignableQrPayload,
  signature: string,
  issuerPublicKeyHex: string,
): void => {
  if (!signature || typeof signature !== "string" || signature.trim().length === 0) {
    throw new QrSignatureError(
      QR_SIGNATURE_ERROR_CODES.MISSING_SIGNATURE,
      "QR code is missing a signature.",
    );
  }

  const cleanPublicKey = stripHexPrefix(issuerPublicKeyHex).toLowerCase();
  if (!isValidHex(cleanPublicKey) || cleanPublicKey.length === 0) {
    throw new QrSignatureError(
      QR_SIGNATURE_ERROR_CODES.PUBLIC_KEY_UNAVAILABLE,
      "Guild issuer public key is unavailable or malformed.",
    );
  }

  const cleanSignature = stripHexPrefix(signature).toLowerCase();
  if (!isValidHex(cleanSignature) || cleanSignature.length === 0) {
    throw new QrSignatureError(
      QR_SIGNATURE_ERROR_CODES.INVALID_SIGNATURE_FORMAT,
      "QR code signature is not valid hex.",
    );
  }

  let publicKey: EC.KeyPair;
  try {
    publicKey = ec.keyFromPublic(cleanPublicKey, "hex");
  } catch {
    throw new QrSignatureError(
      QR_SIGNATURE_ERROR_CODES.PUBLIC_KEY_UNAVAILABLE,
      "Guild issuer public key is unavailable or malformed.",
    );
  }

  const message = buildSigningMessage(payload);
  const messageHash = keccak256(message);

  let valid = false;
  try {
    // `messageHash` is the keccak256 digest as a hex string. elliptic's
    // sign/verify treat a hex-string message as the raw digest (via
    // _truncateToN), so this verifies the precomputed hash directly — no
    // sha256 re-hash.
    valid = publicKey.verify(messageHash, cleanSignature);
  } catch {
    valid = false;
  }

  if (!valid) {
    throw new QrSignatureError(
      QR_SIGNATURE_ERROR_CODES.VERIFICATION_FAILED,
      "QR code signature is invalid.",
    );
  }
};

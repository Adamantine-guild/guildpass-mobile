import { ACCESS_QR_TYPE, ACCESS_QR_VERSION } from "./qrConstants";

export { ACCESS_QR_TYPE, ACCESS_QR_VERSION };

export type AccessQrPayload = {
  type: typeof ACCESS_QR_TYPE;
  version: typeof ACCESS_QR_VERSION;
  guildId: string;
  resourceId: string;
  walletAddress?: string;
  expiresAt?: string;
  /**
   * DER-encoded, hex-secp256k1 signature over the canonical signing message
   * (see qrSignature.buildSigningMessage). Verified against the guild's
   * published issuer public key. Optional during the migration window.
   */
  signature?: string;
};

export type ParsedAccessQrPayload = {
  guildId: string;
  resourceId: string;
  walletAddress?: string;
  expiresAt?: string;
};

const ETHEREUM_ADDRESS_PATTERN = /^0x[a-fA-F0-9]{40}$/;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0;

export const parseAccessQrPayload = (
  rawPayload: string,
  now: Date = new Date(),
): ParsedAccessQrPayload => {
  let decodedPayload: unknown;

  try {
    decodedPayload = JSON.parse(rawPayload);
  } catch {
    throw new Error("QR code is not a supported GuildPass access payload.");
  }

  if (!isRecord(decodedPayload)) {
    throw new Error("QR code payload is malformed.");
  }

  if (decodedPayload.type !== ACCESS_QR_TYPE) {
    throw new Error("QR code payload type is not supported.");
  }

  if (decodedPayload.version !== ACCESS_QR_VERSION) {
    throw new Error("QR code payload version is not supported.");
  }

  if (!isNonEmptyString(decodedPayload.guildId)) {
    throw new Error("QR code is missing a valid guild ID.");
  }

  if (!isNonEmptyString(decodedPayload.resourceId)) {
    throw new Error("QR code is missing a valid resource ID.");
  }

  if (
    decodedPayload.walletAddress !== undefined &&
    (!isNonEmptyString(decodedPayload.walletAddress) ||
      !ETHEREUM_ADDRESS_PATTERN.test(decodedPayload.walletAddress))
  ) {
    throw new Error("QR code contains an invalid wallet address.");
  }

  if (decodedPayload.expiresAt !== undefined) {
    if (!isNonEmptyString(decodedPayload.expiresAt)) {
      throw new Error("QR code contains an invalid expiration time.");
    }

    const expiresAt = new Date(decodedPayload.expiresAt);

    if (Number.isNaN(expiresAt.getTime())) {
      throw new Error("QR code contains an invalid expiration time.");
    }

    if (expiresAt.getTime() <= now.getTime()) {
      throw new Error("QR code has expired.");
    }
  }

  // During the migration window the signature field is optional at the
  // structural layer; cryptographic verification is enforced separately by
  // verifyAndParseAccessQrPayload when the feature flag is enabled.
  if (
    decodedPayload.signature !== undefined &&
    !isNonEmptyString(decodedPayload.signature)
  ) {
    throw new Error("QR code contains an invalid signature.");
  }

  return {
    guildId: decodedPayload.guildId.trim(),
    resourceId: decodedPayload.resourceId.trim(),
    walletAddress: isNonEmptyString(decodedPayload.walletAddress)
      ? decodedPayload.walletAddress
      : undefined,
    expiresAt: isNonEmptyString(decodedPayload.expiresAt) ? decodedPayload.expiresAt : undefined,
  };
};

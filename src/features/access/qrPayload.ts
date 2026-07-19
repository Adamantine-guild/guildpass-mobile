import {
  ACCESS_QR_TYPE,
  ACCESS_QR_VERSION,
  SUPPORTED_QR_PAYLOAD_VERSIONS,
  isSupportedQrPayloadType,
  isSupportedQrPayloadVersion,
} from "./constants";

export { ACCESS_QR_TYPE, ACCESS_QR_VERSION, SUPPORTED_QR_PAYLOAD_VERSIONS };

export const QR_PAYLOAD_ERROR_CODES = {
  MALFORMED_JSON: "QR_PAYLOAD_MALFORMED_JSON",
  MALFORMED_PAYLOAD: "QR_PAYLOAD_MALFORMED",
  UNSUPPORTED_TYPE: "QR_PAYLOAD_UNSUPPORTED_TYPE",
  UNSUPPORTED_VERSION: "QR_PAYLOAD_UNSUPPORTED_VERSION",
  MISSING_GUILD_ID: "QR_PAYLOAD_MISSING_GUILD_ID",
  MISSING_RESOURCE_ID: "QR_PAYLOAD_MISSING_RESOURCE_ID",
  INVALID_WALLET_ADDRESS: "QR_PAYLOAD_INVALID_WALLET_ADDRESS",
  INVALID_EXPIRATION: "QR_PAYLOAD_INVALID_EXPIRATION",
  EXPIRED: "QR_PAYLOAD_EXPIRED",
  INVALID_SIGNATURE: "QR_PAYLOAD_INVALID_SIGNATURE",
} as const;

export type QrPayloadErrorCode =
  (typeof QR_PAYLOAD_ERROR_CODES)[keyof typeof QR_PAYLOAD_ERROR_CODES];

export class QrPayloadError extends Error {
  readonly code: QrPayloadErrorCode;

  constructor(code: QrPayloadErrorCode, message: string) {
    super(message);
    this.name = "QrPayloadError";
    this.code = code;
  }
}

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
    throw new QrPayloadError(
      QR_PAYLOAD_ERROR_CODES.MALFORMED_JSON,
      "QR code is not a supported GuildPass access payload.",
    );
  }

  if (!isRecord(decodedPayload)) {
    throw new QrPayloadError(
      QR_PAYLOAD_ERROR_CODES.MALFORMED_PAYLOAD,
      "QR code payload is malformed.",
    );
  }

  if (!isSupportedQrPayloadType(decodedPayload.type)) {
    throw new QrPayloadError(
      QR_PAYLOAD_ERROR_CODES.UNSUPPORTED_TYPE,
      "QR code payload type is not supported.",
    );
  }

  if (!isSupportedQrPayloadVersion(decodedPayload.type, decodedPayload.version)) {
    throw new QrPayloadError(
      QR_PAYLOAD_ERROR_CODES.UNSUPPORTED_VERSION,
      "QR code payload version is not supported. Please update your app to scan this QR code.",
    );
  }

  if (!isNonEmptyString(decodedPayload.guildId)) {
    throw new QrPayloadError(
      QR_PAYLOAD_ERROR_CODES.MISSING_GUILD_ID,
      "QR code is missing a valid guild ID.",
    );
  }

  if (!isNonEmptyString(decodedPayload.resourceId)) {
    throw new QrPayloadError(
      QR_PAYLOAD_ERROR_CODES.MISSING_RESOURCE_ID,
      "QR code is missing a valid resource ID.",
    );
  }

  if (
    decodedPayload.walletAddress !== undefined &&
    (!isNonEmptyString(decodedPayload.walletAddress) ||
      !ETHEREUM_ADDRESS_PATTERN.test(decodedPayload.walletAddress))
  ) {
    throw new QrPayloadError(
      QR_PAYLOAD_ERROR_CODES.INVALID_WALLET_ADDRESS,
      "QR code contains an invalid wallet address.",
    );
  }

  if (decodedPayload.expiresAt !== undefined) {
    if (!isNonEmptyString(decodedPayload.expiresAt)) {
      throw new QrPayloadError(
        QR_PAYLOAD_ERROR_CODES.INVALID_EXPIRATION,
        "QR code contains an invalid expiration time.",
      );
    }

    const expiresAt = new Date(decodedPayload.expiresAt);

    if (Number.isNaN(expiresAt.getTime())) {
      throw new QrPayloadError(
        QR_PAYLOAD_ERROR_CODES.INVALID_EXPIRATION,
        "QR code contains an invalid expiration time.",
      );
    }

    if (expiresAt.getTime() <= now.getTime()) {
      throw new QrPayloadError(
        QR_PAYLOAD_ERROR_CODES.EXPIRED,
        "QR code has expired.",
      );
    }
  }

  // During the migration window the signature field is optional at the
  // structural layer; cryptographic verification is enforced separately by
  // verifyAndParseAccessQrPayload when the feature flag is enabled.
  if (
    decodedPayload.signature !== undefined &&
    !isNonEmptyString(decodedPayload.signature)
  ) {
    throw new QrPayloadError(
      QR_PAYLOAD_ERROR_CODES.INVALID_SIGNATURE,
      "QR code contains an invalid signature.",
    );
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

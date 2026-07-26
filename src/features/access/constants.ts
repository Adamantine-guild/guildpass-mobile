/**
 * Canonical QR payload constants and supported version allow-list.
 *
 * Centralizes supported type/version schemas used across parsing and
 * signature verification modules.
 */

export const ACCESS_QR_TYPE = "guildpass.access-check";
export const ACCESS_QR_VERSION = 2;

export type SupportedQrPayloadVersion = {
  readonly type: string;
  readonly version: number;
};

/**
 * Single exported constant list of supported (type, version) pairs.
 * Used consistently by the payload parser to enforce schema allow-listing.
 */
export const SUPPORTED_QR_PAYLOAD_VERSIONS: readonly SupportedQrPayloadVersion[] = [
  {
    type: ACCESS_QR_TYPE,
    version: ACCESS_QR_VERSION,
  },
] as const;

export const isSupportedQrPayloadType = (type: unknown): boolean =>
  typeof type === "string" && SUPPORTED_QR_PAYLOAD_VERSIONS.some((entry) => entry.type === type);

export const isSupportedQrPayloadVersion = (type: unknown, version: unknown): boolean =>
  typeof type === "string" &&
  typeof version === "number" &&
  SUPPORTED_QR_PAYLOAD_VERSIONS.some((entry) => entry.type === type && entry.version === version);

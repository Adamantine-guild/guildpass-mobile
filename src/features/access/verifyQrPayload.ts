import { getGuildIssuerPublicKey } from "./guildIssuerKey";
import { QrSignatureError, verifyQrSignature } from "./qrSignature";
import type { QrSignatureErrorCode } from "./qrSignature";
import { parseAccessQrPayload, QrPayloadError } from "./qrPayload";
import type { ParsedAccessQrPayload } from "./qrPayload";
import type { QrPayloadErrorCode } from "./qrPayload";
import { checkAndRecordNonce } from "./qrReplayGuard";

export type QrValidationResult =
  | { success: true; payload: ParsedAccessQrPayload }
  | {
      success: false;
      reason: QrSignatureErrorCode | QrPayloadErrorCode | "UNKNOWN_ERROR";
      message?: string;
    };

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

export type VerifiedAccessQrPayload = {
  payload: ParsedAccessQrPayload;
  isVerified: boolean;
};

/**
 * Parse AND cryptographically verify a QR payload.
 *
 * Structural checks (schema, expiry) always run via `parseAccessQrPayload`.
 * Signature verification is strictly enforced for all version 2 payloads.
 *
 * Replay protection runs independently: when a payload carries
 * a `nonce`, it is checked against the in-memory replay guard
 * (`qrReplayGuard.ts`) and rejected with a `QrPayloadError`
 * (code `ALREADY_USED`) if it was already accepted within its validity
 * window.
 */
export const verifyAndParseAccessQrPayload = async (
  rawPayload: string,
  now: Date = new Date(),
): Promise<VerifiedAccessQrPayload> => {
  const parsed = parseAccessQrPayload(rawPayload, now);

  let decoded: unknown;
  try {
    decoded = JSON.parse(rawPayload);
  } catch {
    // Already validated by parseAccessQrPayload; unreachable in practice.
    throw new Error("QR code is not a supported GuildPass access payload.");
  }

  const signature =
    isRecord(decoded) && typeof decoded.signature === "string" ? decoded.signature : undefined;

  const issuerPublicKey = await getGuildIssuerPublicKey(parsed.guildId, parsed.kid, now);

  verifyQrSignature(
    {
      guildId: parsed.guildId,
      resourceId: parsed.resourceId,
      walletAddress: parsed.walletAddress,
      expiresAt: parsed.expiresAt,
      kid: parsed.kid,
    },
    signature ?? "",
    issuerPublicKey,
  );

  if (parsed.nonce !== undefined) {
    try {
      await checkAndRecordNonce(parsed.nonce, parsed.expiresAt, now);
    } catch (error) {
      if (error instanceof QrPayloadError) {
        return { success: false, reason: error.code, message: error.message };
      }
      return { success: false, reason: "UNKNOWN_ERROR", message: String(error) };
    }
  }

  return { payload: parsed, isVerified: true };
};

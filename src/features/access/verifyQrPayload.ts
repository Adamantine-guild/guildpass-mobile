import { appConfig } from "../../config/appConfig";
import { getGuildIssuerPublicKey } from "./guildIssuerKey";
import { verifyQrSignature } from "./qrSignature";
import { parseAccessQrPayload } from "./qrPayload";
import type { ParsedAccessQrPayload } from "./qrPayload";
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

/**
 * Parse AND cryptographically verify a QR payload.
 *
 * Structural checks (schema, expiry) always run via `parseAccessQrPayload`.
 * Signature verification runs only when the `qrSignatureVerification` feature
 * flag is enabled:
 *
 *   - flag OFF  → unsigned payloads are accepted (migration window).
 *   - flag ON   → payloads must carry a valid signature, otherwise a
 *                 QrSignatureError is thrown (specific code distinguishes
 *                 missing / malformed / failed signatures).
 *
 * This keeps existing unsigned payloads working until the issuer backend
 * rolls signing out everywhere, then enforces it once the flag flips on.
 *
 * Replay protection runs independently of that flag: when a payload carries
 * a `nonce`, it is checked against the in-memory replay guard
 * (`qrReplayGuard.ts`) and rejected with a `QrPayloadError`
 * (code `ALREADY_USED`) if it was already accepted within its validity
 * window. Payloads without a `nonce` skip this check (migration window).
 *
 * Kept in its own module so the pure structural parser (`qrPayload.ts`) has no
 * SDK / config imports and stays trivially unit-testable.
 */
export const verifyAndParseAccessQrPayload = async (
  rawPayload: string,
  now: Date = new Date(),
): Promise<QrValidationResult> => {
  let parsed: ParsedAccessQrPayload;
  
  try {
    parsed = parseAccessQrPayload(rawPayload, now);
  } catch (error) {
    if (error instanceof QrPayloadError) {
      return { success: false, reason: error.code, message: error.message };
    }
    return { success: false, reason: "UNKNOWN_ERROR", message: String(error) };
  }

  if (appConfig.qrSignatureVerification) {
    let decoded: unknown;
    try {
      decoded = JSON.parse(rawPayload);
    } catch {
      // Already validated by parseAccessQrPayload; unreachable in practice.
      return { success: false, reason: "UNKNOWN_ERROR", message: "QR code is not a supported GuildPass access payload." };
    }

    const signature =
      isRecord(decoded) && typeof decoded.signature === "string" ? decoded.signature : undefined;

    try {
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
    } catch (error) {
      if (error instanceof QrSignatureError) {
        return { success: false, reason: error.code, message: error.message };
      }
      return { success: false, reason: "UNKNOWN_ERROR", message: String(error) };
    }
  }

  if (parsed.nonce !== undefined) {
    await checkAndRecordNonce(parsed.nonce, parsed.expiresAt, now);
  }

  return { success: true, payload: parsed };
};

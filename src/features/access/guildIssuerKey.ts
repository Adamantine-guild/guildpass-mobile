import { guildPassClient } from "../../lib/guildpassClient";
import { QrSignatureError, QR_SIGNATURE_ERROR_CODES } from "./qrSignature";

/**
 * Fetches and caches the guild issuer public key used to verify QR payload
 * signatures.
 *
 * The key lives on the guild config returned by the SDK
 * (`guilds.getGuildConfig`), under the `issuerPublicKey` field (hex-encoded
 * secp256k1 public key). We keep an in-memory cache so a busy scanner session
 * does not re-fetch the same key on every scan; the cache is intentionally
 * unbounded-but-small (one entry per scanned guild) and process-lifetime.
 */

type GuildConfigWithIssuerKey = {
  guildId: string;
  issuerPublicKey?: string;
  [key: string]: unknown;
};

const keyCache = new Map<string, string>();

export const clearIssuerKeyCache = (): void => {
  keyCache.clear();
};

/**
 * Resolve the issuer public key for a guild, using the cache when possible.
 *
 * @throws {QrSignatureError} with code PUBLIC_KEY_UNAVAILABLE when the SDK call
 *         fails or the config does not carry a usable `issuerPublicKey`. The
 *         caller decides whether that is fatal (feature flag dependent).
 */
export const getGuildIssuerPublicKey = async (guildId: string): Promise<string> => {
  const cached = keyCache.get(guildId);
  if (cached !== undefined) {
    return cached;
  }

  let config: GuildConfigWithIssuerKey;
  try {
    config = (await guildPassClient.guilds.getGuildConfig({
      guildId,
    })) as GuildConfigWithIssuerKey;
  } catch {
    throw new QrSignatureError(
      QR_SIGNATURE_ERROR_CODES.PUBLIC_KEY_UNAVAILABLE,
      "Unable to fetch guild issuer public key.",
    );
  }

  const publicKey = config?.issuerPublicKey;
  if (typeof publicKey !== "string" || publicKey.trim().length === 0) {
    throw new QrSignatureError(
      QR_SIGNATURE_ERROR_CODES.PUBLIC_KEY_UNAVAILABLE,
      "Guild config does not publish an issuer public key.",
    );
  }

  const normalized = publicKey.trim();
  keyCache.set(guildId, normalized);
  return normalized;
};

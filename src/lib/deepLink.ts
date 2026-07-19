import { validateAndNormalizeAddress } from "./walletValidation";

export type DeepLinkType = "guild-detail" | "access-check";

export interface GuildDetailDeepLink {
  type: "guild-detail";
  guildId: string;
  params: {
    guildId: string;
  };
  pathname: string;
}

export interface AccessCheckDeepLink {
  type: "access-check";
  guildId: string;
  resourceId: string;
  walletAddress?: string;
  params: {
    guildId: string;
    resourceId: string;
    walletAddress?: string;
  };
  pathname: string;
}

export type DeepLinkRoute = GuildDetailDeepLink | AccessCheckDeepLink;

export type ParsedDeepLinkResult =
  | {
      valid: true;
      route: DeepLinkRoute;
    }
  | {
      valid: false;
      error: string;
      redirectUrl: "/deep-link-error";
    };

const SUPPORTED_SCHEMES = ["guildpass:", "https:", "http:"];
const SUPPORTED_HOST = "guildpass.xyz";

function safeDecode(val: string): string {
  try {
    return decodeURIComponent(val);
  } catch {
    return val;
  }
}

/**
 * Parses and validates deep link URLs according to documented GuildPass Mobile rules.
 *
 * Supported Formats:
 * - Guild Detail:
 *     Custom Scheme: guildpass://guild/{guildId}
 *     Universal Link: https://guildpass.xyz/guild/{guildId}
 * - Access Check:
 *     Custom Scheme: guildpass://access-check?guildId={id}&resourceId={id}&walletAddress={address}
 *     Universal Link: https://guildpass.xyz/access-check?guildId={id}&resourceId={id}&walletAddress={address}
 *
 * Validation Rules:
 * - Guild detail links require a valid non-empty guildId.
 * - Access check links require both guildId and resourceId parameters.
 * - walletAddress is optional for access check; if provided, it must be a valid Ethereum address.
 * - Invalid or malformed links return valid: false with redirectUrl: "/deep-link-error".
 */
export function parseDeepLink(rawUrl: string | null | undefined): ParsedDeepLinkResult {
  if (!rawUrl || typeof rawUrl !== "string" || !rawUrl.trim()) {
    return {
      valid: false,
      error: "Deep link URL is empty or undefined.",
      redirectUrl: "/deep-link-error",
    };
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(rawUrl.trim());
  } catch {
    return {
      valid: false,
      error: "Malformed URL.",
      redirectUrl: "/deep-link-error",
    };
  }

  const protocol = parsedUrl.protocol.toLowerCase();
  if (!SUPPORTED_SCHEMES.includes(protocol)) {
    return {
      valid: false,
      error: `Unsupported scheme '${protocol}'. Supported schemes: guildpass:// or https://.`,
      redirectUrl: "/deep-link-error",
    };
  }

  let fullPath = "";
  if (protocol === "guildpass:") {
    // For custom scheme:
    // guildpass://guild/alpha-guild -> hostname is 'guild', pathname is '/alpha-guild'
    // guildpass://access-check -> hostname is 'access-check', pathname is ''
    // guildpass:///guild/alpha-guild -> hostname is '', pathname is '/guild/alpha-guild'
    const hostname = parsedUrl.hostname ? parsedUrl.hostname.trim() : "";
    const pathname = parsedUrl.pathname ? parsedUrl.pathname.trim() : "";

    if (hostname) {
      fullPath = `${hostname}${pathname}`;
    } else {
      fullPath = pathname.replace(/^\/+/, "");
    }
  } else {
    // Universal link (https:// or http://)
    const hostname = parsedUrl.hostname.toLowerCase();
    if (hostname !== SUPPORTED_HOST) {
      return {
        valid: false,
        error: `Invalid domain '${hostname}'. Expected '${SUPPORTED_HOST}'.`,
        redirectUrl: "/deep-link-error",
      };
    }
    fullPath = parsedUrl.pathname.replace(/^\/+/, "");
  }

  // Remove trailing slashes for path matching
  fullPath = fullPath.replace(/\/+$/, "");

  // Match routes
  if (fullPath.startsWith("guild/") || fullPath === "guild") {
    const parts = fullPath.split("/");
    const guildId = safeDecode(parts.slice(1).join("/")).trim();

    if (!guildId) {
      return {
        valid: false,
        error: "Guild detail link requires a valid guildId.",
        redirectUrl: "/deep-link-error",
      };
    }

    return {
      valid: true,
      route: {
        type: "guild-detail",
        guildId,
        params: { guildId },
        pathname: `/guilds/${guildId}`,
      },
    };
  }

  if (fullPath === "access-check") {
    const rawGuildId = parsedUrl.searchParams.get("guildId");
    const rawResourceId = parsedUrl.searchParams.get("resourceId");
    const rawWalletParam = parsedUrl.searchParams.get("walletAddress");

    const guildId = rawGuildId !== null ? safeDecode(rawGuildId).trim() : "";
    const resourceId = rawResourceId !== null ? safeDecode(rawResourceId).trim() : "";
    const rawWalletAddress = rawWalletParam !== null ? safeDecode(rawWalletParam).trim() : "";

    if (!guildId || !resourceId) {
      return {
        valid: false,
        error: "Access check link requires both guildId and resourceId parameters.",
        redirectUrl: "/deep-link-error",
      };
    }

    let normalizedWalletAddress: string | undefined = undefined;
    if (rawWalletAddress) {
      const addressValidation = validateAndNormalizeAddress(rawWalletAddress);
      if (!addressValidation.valid) {
        return {
          valid: false,
          error: "Invalid wallet address in access check link.",
          redirectUrl: "/deep-link-error",
        };
      }
      normalizedWalletAddress = addressValidation.address;
    }

    return {
      valid: true,
      route: {
        type: "access-check",
        guildId,
        resourceId,
        ...(normalizedWalletAddress ? { walletAddress: normalizedWalletAddress } : {}),
        params: {
          guildId,
          resourceId,
          ...(normalizedWalletAddress ? { walletAddress: normalizedWalletAddress } : {}),
        },
        pathname: "/access-check",
      },
    };
  }

  return {
    valid: false,
    error: `Unknown deep link path '${fullPath}'.`,
    redirectUrl: "/deep-link-error",
  };
}

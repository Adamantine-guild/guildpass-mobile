// Keep this import consistent with existing appConfig.ts so bundlers/TS
// can resolve it in the Expo environment.
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import Constants from "expo-constants";

// ---------------------------------------------------------------------------
// RPC endpoint configuration
// ---------------------------------------------------------------------------

export type RpcConfig = {
  chainRpcUrls: Record<number, string[]>;
  timeouts: {
    roleResolverPerChainTimeoutMs: number;
    roleResolverRpcAttemptTimeoutMs: number;
    roleResolverBackoffBaseDelayMs: number;
    roleResolverBackoffMaxDelayMs: number;
    roleResolverMaxAttemptsPerEndpoint: number;
  };
};

function parseJsonObject(raw: string | undefined): unknown {
  if (raw == null || raw.trim().length === 0) return {};
  return JSON.parse(raw);
}

function parseNumber(raw: unknown, fallback: number): number {
  const n = typeof raw === "string" ? Number(raw) : typeof raw === "number" ? raw : NaN;
  return Number.isFinite(n) ? n : fallback;
}

function isHttpUrl(s: unknown): s is string {
  if (typeof s !== "string") return false;
  try {
    const u = new URL(s);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

function loadRpcConfig(): RpcConfig {
  const extra = Constants.expoConfig?.extra ?? {};

  const endpointsJsonRaw: unknown = (extra as any).EXPO_PUBLIC_RPC_ENDPOINTS_JSON;
  const parsed = parseJsonObject(
    typeof endpointsJsonRaw === "string" ? endpointsJsonRaw : undefined,
  );

  const chainRpcUrls: Record<number, string[]> = {};

  if (parsed && typeof parsed === "object") {
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      const chainId = Number(k);
      if (!Number.isSafeInteger(chainId) || chainId <= 0) continue;

      if (!Array.isArray(v)) continue;
      const urls = v.filter(isHttpUrl);
      if (urls.length > 0) chainRpcUrls[chainId] = urls;
    }
  }

  // Defaults are small for mobile + keep UI responsive.
  const timeouts: RpcConfig["timeouts"] = {
    roleResolverPerChainTimeoutMs: parseNumber(
      (extra as any).EXPO_PUBLIC_ROLE_RESOLVER_PER_CHAIN_TIMEOUT_MS,
      4000,
    ),
    roleResolverRpcAttemptTimeoutMs: parseNumber(
      (extra as any).EXPO_PUBLIC_ROLE_RESOLVER_RPC_ATTEMPT_TIMEOUT_MS,
      2000,
    ),
    roleResolverBackoffBaseDelayMs: parseNumber(
      (extra as any).EXPO_PUBLIC_ROLE_RESOLVER_BACKOFF_BASE_DELAY_MS,
      250,
    ),
    roleResolverBackoffMaxDelayMs: parseNumber(
      (extra as any).EXPO_PUBLIC_ROLE_RESOLVER_BACKOFF_MAX_DELAY_MS,
      3000,
    ),
    roleResolverMaxAttemptsPerEndpoint: parseNumber(
      (extra as any).EXPO_PUBLIC_ROLE_RESOLVER_MAX_ATTEMPTS_PER_ENDPOINT,
      2,
    ),
  };

  return { chainRpcUrls, timeouts };
}

export const rpcConfig = loadRpcConfig();

export function getRpcsForChain(chainId: number): string[] {
  return rpcConfig.chainRpcUrls[chainId] ?? [];
}

export function hasAnyRpcsConfigured(): boolean {
  return Object.values(rpcConfig.chainRpcUrls).some((arr) => arr.length > 0);
}

// ---------------------------------------------------------------------------
// RPC domain allowlist
// ---------------------------------------------------------------------------
// The on-chain eligibility resolver talks to third-party RPC providers (which
// are never on the GuildPass pinned-domain set), so it validates every
// endpoint against a dedicated allowlist derived from `chainRpcUrls`.
// See docs/threat-model.md §6 (Control 3: RPC Endpoint Domain Validation).

function getUrlHostname(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
}

/**
 * Hostnames the app is configured to reach for on-chain RPC traffic, derived
 * from `chainRpcUrls`. `chainRpcUrls` may be injected for tests.
 */
export function getKnownRpcHostnames(
  chainRpcUrls: Record<number, string[]> = rpcConfig.chainRpcUrls,
): Set<string> {
  const hostnames = new Set<string>();
  for (const urls of Object.values(chainRpcUrls)) {
    for (const url of urls) {
      const hostname = getUrlHostname(url);
      if (hostname !== null) hostnames.add(hostname);
    }
  }
  return hostnames;
}

/**
 * Classify a URL against the RPC allowlist. When `chainId` is provided the
 * check is chain-aware: the URL must belong to that chain's configured
 * endpoints to count as known.
 */
export function isKnownRpcUrl(
  url: string,
  chainId?: number,
  chainRpcUrls: Record<number, string[]> = rpcConfig.chainRpcUrls,
): boolean {
  const hostname = getUrlHostname(url);
  if (hostname === null) return false;

  if (chainId !== undefined) {
    for (const configured of chainRpcUrls[chainId] ?? []) {
      if (getUrlHostname(configured) === hostname) return true;
    }
    return false;
  }

  return getKnownRpcHostnames(chainRpcUrls).has(hostname);
}

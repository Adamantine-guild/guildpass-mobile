/**
 * RPC Endpoint Domain Guard
 *
 * The on-chain eligibility resolver talks to third-party RPC providers —
 * never GuildPass's own pinned domains — sending the connected wallet's
 * address in every `eth_call` payload. Before each RPC attempt, the resolver
 * validates the endpoint against an allowlist derived from
 * `rpcConfig.chainRpcUrls` and flags any endpoint that is not part of that
 * allowlist with a loud, distinct warning.
 *
 * This mirrors the JS-level domain validation that `secureFetch` performs for
 * pinned GuildPass domains, but as a *separate* check: RPC providers are by
 * definition not on the pinned-domain list, so they get their own allowlist.
 *
 * Design note: observability-first. Unknown endpoints are flagged, not
 * blocked — RPC providers may be user-configurable, so hard-enforcement would
 * break legitimate custom endpoints. See docs/threat-model.md §6.
 */

import { isKnownRpcUrl, rpcConfig } from "../../config/rpcConfig";

export type RpcDomainStatus = "known" | "unknown";

export const RPC_DOMAIN_LOG_PREFIX = "[GuildPass Security][RPC]";

export function rpcUrlHostname(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
}

/**
 * Classify an RPC endpoint against the configured allowlist. `chainRpcUrls`
 * may be injected to test the guard against a known allowlist without
 * touching the load-time configuration.
 */
export function classifyRpcDomain(
  url: string,
  chainId: number,
  chainRpcUrls: Record<number, string[]> = rpcConfig.chainRpcUrls,
): RpcDomainStatus {
  return isKnownRpcUrl(url, chainId, chainRpcUrls) ? "known" : "unknown";
}

/**
 * Validate that an RPC endpoint is part of the app-configured allowlist and
 * log the result. Unknown endpoints are flagged with a warning so fixed
 * wallet-address-bearing traffic to an unexpected provider cannot pass
 * silently. Never throws.
 *
 * @returns The classification ("known" | "unknown").
 */
export function validateRpcDomain(
  url: string,
  chainId: number,
  chainRpcUrls: Record<number, string[]> = rpcConfig.chainRpcUrls,
): RpcDomainStatus {
  const status = classifyRpcDomain(url, chainId, chainRpcUrls);
  const hostname = rpcUrlHostname(url) ?? url;

  if (status === "known") {
    console.log(`${RPC_DOMAIN_LOG_PREFIX} Endpoint allowed by rpcConfig: ${hostname}`);
  } else {
    console.warn(
      `${RPC_DOMAIN_LOG_PREFIX} Endpoint NOT in rpcConfig allowlist: ${hostname} (chainId ${chainId}). ` +
        "Confirm this RPC endpoint is intentional; it is not part of the app-configured allowlist.",
    );
  }

  return status;
}

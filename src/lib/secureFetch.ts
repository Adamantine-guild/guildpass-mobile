/**
 * Secure Fetch Wrapper
 *
 * Wraps the global `fetch` to enforce domain validation against the
 * certificate pinning configuration before dispatching requests.
 *
 * IMPORTANT: This wrapper provides JS-level domain validation and
 * observability. The authoritative TLS pinning enforcement happens
 * at the native layer (Android Network Security Config / iOS ATS).
 *
 * Usage:
 *   import { secureFetch } from "@/lib/secureFetch";
 *   const res = await secureFetch("https://api.guildpass.xyz/v1/...");
 */

import { isPinnedDomain, logPinningStatus } from "../features/security/certificatePinning";
import { isDeviceSecure } from "../features/security/deviceIntegrity";
import { getIntegrityResponsePolicy } from "../features/security/deviceIntegrity";

// ---------------------------------------------------------------------------
// Initialization
// ---------------------------------------------------------------------------

let _initialized = false;

/** Call once at app startup to log pinning status. */
export function initializeSecureFetch(): void {
  if (_initialized) return;
  _initialized = true;
  logPinningStatus();
}

// ---------------------------------------------------------------------------
// Secure fetch
// ---------------------------------------------------------------------------

/**
 * A fetch-compatible wrapper that enforces security policies:
 *  1. For pinned domains: logs and proceeds (native layer enforces pinning).
 *  2. For non-pinned, non-localhost domains in production: warns.
 *  3. Optionally gates on device integrity for sensitive endpoints.
 */
export async function secureFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  initializeSecureFetch();

  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;

  // -- Domain validation --
  const isPinned = isPinnedDomain(url);

  if (isPinned) {
    // Traffic to pinned domains — native layer handles TLS verification.
    // No additional JS-level action needed beyond logging.
  } else {
    // Non-pinned domain — log a warning in non-development builds.
    if (process.env.NODE_ENV !== "development" && !url.includes("localhost")) {
      console.warn(`[GuildPass Security] Request to non-pinned domain: ${new URL(url).hostname}`);
    }
  }

  // -- Device integrity gate (for sensitive flows) --
  // Callers can opt into integrity gating by including a header.
  const requiresIntegrity =
    init?.headers != null &&
    (init.headers as Record<string, string>)["X-Require-Device-Integrity"] === "true";

  if (requiresIntegrity) {
    const policy = getIntegrityResponsePolicy();
    const deviceSecure = isDeviceSecure();

    if (!deviceSecure && policy === "block") {
      throw new Error("[GuildPass Security] Request blocked: device integrity check failed.");
    }

    if (!deviceSecure && policy === "warn") {
      console.warn(
        "[GuildPass Security] Proceeding despite device integrity violation (policy: warn).",
      );
    }

    // Strip the internal header before dispatching.
    if (init?.headers) {
      const headers = new Headers(init.headers as HeadersInit);
      headers.delete("X-Require-Device-Integrity");
      init = { ...init, headers };
    }
  }

  return fetch(input, init);
}

/**
 * Convenience: wraps secureFetch with JSON parsing.
 */
export async function secureFetchJson<T = unknown>(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<T> {
  const response = await secureFetch(input, init);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }
  return response.json() as Promise<T>;
}

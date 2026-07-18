import { FetchLike } from "./authClient.types";

/** Lazily provides the current access token, or null when unauthenticated. */
export type AccessTokenProvider = () => string | null;

/**
 * Attempts a transparent refresh. Returns the new access token on success, or
 * null when refresh fails (caller then surfaces the original 401).
 */
export type RefreshFn = () => Promise<string | null>;

export interface AuthenticatedFetchOptions {
  getAccessToken: AccessTokenProvider;
  refresh: RefreshFn;
  /** Underlying transport. Defaults to `globalThis.fetch`. */
  baseFetch?: FetchLike;
}

const AUTH_HEADER = "Authorization";

function withBearer(init: RequestInit | undefined, token: string): RequestInit {
  const headers = new Headers(init?.headers as HeadersInit | undefined);
  headers.set(AUTH_HEADER, `Bearer ${token}`);
  return { ...init, headers };
}

/**
 * Wrap a `fetch` so every request carries the session's bearer token and a 401
 * transparently triggers a single refresh + retry.
 *
 * Contract:
 *   - If there is a token, attach `Authorization: Bearer <token>`.
 *   - On a 401 response AND a token was present, call `refresh()` exactly once.
 *     - refresh succeeds → retry the request once with the new token; return that.
 *     - refresh fails (null) → return the ORIGINAL 401 so the caller still sees it.
 *   - If there was no token (unauthenticated), a 401 is returned as-is — nothing
 *     to refresh, and retrying would loop.
 *
 * This gives "expired access token → no user-visible interruption" for the common
 * case while never entering a refresh loop.
 */
export function createAuthenticatedFetch(options: AuthenticatedFetchOptions): FetchLike {
  const base = options.baseFetch ?? (globalThis.fetch as FetchLike | undefined);
  if (typeof base !== "function") {
    throw new Error("createAuthenticatedFetch requires a base fetch (options.baseFetch or globalThis.fetch)");
  }

  return async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const token = options.getAccessToken();

    // Unauthenticated request — pass through untouched. A 401 here is terminal.
    if (!token) {
      return base(input, init);
    }

    const firstResponse = await base(input, withBearer(init, token));
    if (firstResponse.status !== 401) {
      return firstResponse;
    }

    // Access token was rejected — try one refresh, then one retry.
    const refreshedToken = await options.refresh();
    if (!refreshedToken) {
      return firstResponse; // refresh failed → surface the original 401
    }

    return base(input, withBearer(init, refreshedToken));
  };
}

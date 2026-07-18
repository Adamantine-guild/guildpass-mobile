/**
 * createAuthenticatedFetch — bearer attach + transparent 401 refresh/retry.
 *
 * These pin the "silent refresh on expiry" acceptance criterion: an expired
 * access token must refresh and retry once, with no loop and no user-visible
 * failure in the common case.
 */

import { describe, it, expect, vi } from "vitest";
import { createAuthenticatedFetch } from "../src/features/auth/authFetch";

function resp(status: number): Response {
  return { ok: status >= 200 && status < 300, status } as Response;
}

function getHeader(init: RequestInit | undefined, name: string): string | null {
  return new Headers(init?.headers as HeadersInit | undefined).get(name);
}

describe("createAuthenticatedFetch", () => {
  it("attaches the bearer token to authenticated requests", async () => {
    const base = vi.fn().mockResolvedValue(resp(200));
    const authFetch = createAuthenticatedFetch({
      getAccessToken: () => "access-1",
      refresh: vi.fn(),
      baseFetch: base,
    });

    await authFetch("https://api.test/guilds");

    expect(getHeader(base.mock.calls[0][1], "Authorization")).toBe("Bearer access-1");
  });

  it("passes through unauthenticated requests without an Authorization header", async () => {
    const base = vi.fn().mockResolvedValue(resp(200));
    const refresh = vi.fn();
    const authFetch = createAuthenticatedFetch({
      getAccessToken: () => null,
      refresh,
      baseFetch: base,
    });

    await authFetch("https://api.test/guilds");

    expect(getHeader(base.mock.calls[0][1], "Authorization")).toBeNull();
    expect(refresh).not.toHaveBeenCalled();
  });

  it("does not retry a 401 when there was no token (nothing to refresh)", async () => {
    const base = vi.fn().mockResolvedValue(resp(401));
    const refresh = vi.fn();
    const authFetch = createAuthenticatedFetch({
      getAccessToken: () => null,
      refresh,
      baseFetch: base,
    });

    const result = await authFetch("https://api.test/guilds");

    expect(result.status).toBe(401);
    expect(refresh).not.toHaveBeenCalled();
    expect(base).toHaveBeenCalledTimes(1);
  });

  it("on 401: refreshes once and retries once with the new token", async () => {
    const base = vi
      .fn()
      .mockResolvedValueOnce(resp(401)) // first call with stale token
      .mockResolvedValueOnce(resp(200)); // retry with refreshed token
    const refresh = vi.fn().mockResolvedValue("access-2");

    const authFetch = createAuthenticatedFetch({
      getAccessToken: () => "access-1",
      refresh,
      baseFetch: base,
    });

    const result = await authFetch("https://api.test/membership");

    expect(result.status).toBe(200);
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(base).toHaveBeenCalledTimes(2);
    expect(getHeader(base.mock.calls[1][1], "Authorization")).toBe("Bearer access-2");
  });

  it("surfaces the original 401 when refresh fails (returns null)", async () => {
    const base = vi.fn().mockResolvedValue(resp(401));
    const refresh = vi.fn().mockResolvedValue(null);

    const authFetch = createAuthenticatedFetch({
      getAccessToken: () => "access-1",
      refresh,
      baseFetch: base,
    });

    const result = await authFetch("https://api.test/membership");

    expect(result.status).toBe(401);
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(base).toHaveBeenCalledTimes(1); // no retry after failed refresh
  });

  it("does not refresh when the first response is a non-401 error", async () => {
    const base = vi.fn().mockResolvedValue(resp(500));
    const refresh = vi.fn();

    const authFetch = createAuthenticatedFetch({
      getAccessToken: () => "access-1",
      refresh,
      baseFetch: base,
    });

    const result = await authFetch("https://api.test/membership");

    expect(result.status).toBe(500);
    expect(refresh).not.toHaveBeenCalled();
  });

  it("preserves caller headers when attaching the bearer", async () => {
    const base = vi.fn().mockResolvedValue(resp(200));
    const authFetch = createAuthenticatedFetch({
      getAccessToken: () => "access-1",
      refresh: vi.fn(),
      baseFetch: base,
    });

    await authFetch("https://api.test/guilds", { headers: { "X-Custom": "1" } });

    const sent = base.mock.calls[0][1];
    expect(getHeader(sent, "X-Custom")).toBe("1");
    expect(getHeader(sent, "Authorization")).toBe("Bearer access-1");
  });
});

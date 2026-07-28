import { beforeEach, describe, expect, it, vi } from "vitest";
import { createApiClient } from "../../../src/services/api/client";
import { ApiError } from "../../../src/services/api/errors";

describe("api client", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("retries transient failures with backoff", async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new TypeError("network"))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      );

    vi.stubGlobal("fetch", fetchMock);

    const client = createApiClient({
      baseUrl: "https://example.com",
      timeoutMs: 1000,
      retryConfig: { maxAttempts: 2, initialDelayMs: 1, maxDelayMs: 5 },
    });

    const result = await client.request<{ ok: boolean }>({ path: "/health" });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result).toEqual({ ok: true });
  });

  it("refreshes once and retries after 401", async () => {
    const refreshAccessToken = vi.fn().mockResolvedValue("fresh-token");
    const getAccessToken = vi
      .fn()
      .mockResolvedValueOnce("stale-token")
      .mockResolvedValueOnce("fresh-token");
    const invalidateSession = vi.fn();

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ message: "unauthorized" }), {
          status: 401,
          headers: { "content-type": "application/json" },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      );

    vi.stubGlobal("fetch", fetchMock);

    const client = createApiClient({
      baseUrl: "https://example.com",
      timeoutMs: 1000,
      auth: {
        getAccessToken,
        refreshAccessToken,
        invalidateSession,
      },
    });

    const result = await client.request<{ ok: boolean }>({ path: "/secure" });

    expect(refreshAccessToken).toHaveBeenCalledTimes(1);
    expect(invalidateSession).not.toHaveBeenCalled();
    expect(result).toEqual({ ok: true });
  });

  it("invalidates the session and throws unauthorized when refresh also fails", async () => {
    const refreshAccessToken = vi.fn().mockRejectedValue(new Error("refresh network failure"));
    const invalidateSession = vi.fn();
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ message: "unauthorized" }), {
        status: 401,
        headers: { "content-type": "application/json" },
      }),
    );

    vi.stubGlobal("fetch", fetchMock);

    const client = createApiClient({
      baseUrl: "https://example.com",
      timeoutMs: 1000,
      auth: {
        getAccessToken: vi.fn().mockResolvedValue("stale-token"),
        refreshAccessToken,
        invalidateSession,
      },
    });

    await expect(client.request({ path: "/secure" })).rejects.toMatchObject({
      code: "unauthorized",
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(refreshAccessToken).toHaveBeenCalledTimes(1);
    expect(invalidateSession).toHaveBeenCalledTimes(1);
  });

  it("invalidates session and throws unauthorized when retry after refresh still gets 401", async () => {
    const refreshAccessToken = vi.fn().mockResolvedValue("fresh-token");
    const invalidateSession = vi.fn();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ message: "unauthorized" }), {
          status: 401,
          headers: { "content-type": "application/json" },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ message: "still unauthorized" }), {
          status: 401,
          headers: { "content-type": "application/json" },
        }),
      );

    vi.stubGlobal("fetch", fetchMock);

    const client = createApiClient({
      baseUrl: "https://example.com",
      timeoutMs: 1000,
      auth: {
        getAccessToken: vi.fn().mockResolvedValue("stale-token"),
        refreshAccessToken,
        invalidateSession,
      },
    });

    await expect(client.request({ path: "/secure" })).rejects.toMatchObject({
      code: "unauthorized",
      status: 401,
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(refreshAccessToken).toHaveBeenCalledTimes(1);
    expect(invalidateSession).toHaveBeenCalledTimes(1);
  });

  it("does NOT invalidate session when retry after refresh fails with a transient error (e.g. 500)", async () => {
    const refreshAccessToken = vi.fn().mockResolvedValue("fresh-token");
    const invalidateSession = vi.fn();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ message: "unauthorized" }), {
          status: 401,
          headers: { "content-type": "application/json" },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ message: "server unavailable" }), {
          status: 500,
          headers: { "content-type": "application/json" },
        }),
      );

    vi.stubGlobal("fetch", fetchMock);

    const client = createApiClient({
      baseUrl: "https://example.com",
      timeoutMs: 1000,
      retryConfig: { maxAttempts: 1, initialDelayMs: 1, maxDelayMs: 1 },
      auth: {
        getAccessToken: vi.fn().mockResolvedValue("stale-token"),
        refreshAccessToken,
        invalidateSession,
      },
    });

    await expect(client.request({ path: "/secure" })).rejects.toMatchObject({
      code: "server",
      status: 500,
      retryable: true,
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(refreshAccessToken).toHaveBeenCalledTimes(1);
    expect(invalidateSession).not.toHaveBeenCalled();
  });

  it("normalizes errors into ApiError", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ message: "boom" }), {
        status: 500,
        headers: { "content-type": "application/json" },
      }),
    );

    vi.stubGlobal("fetch", fetchMock);

    const client = createApiClient({
      baseUrl: "https://example.com",
      timeoutMs: 1000,
      retryConfig: { maxAttempts: 1, initialDelayMs: 1, maxDelayMs: 1 },
    });

    await expect(client.request({ path: "/fail" })).rejects.toMatchObject({
      code: "server",
      status: 500,
      retryable: true,
    });
  });

  it("throws ApiError on timeout", async () => {
    const fetchMock = vi.fn().mockImplementation(
      () => new Promise((_resolve, reject) => setTimeout(() => reject(new Error("timeout")), 30)),
    );

    vi.stubGlobal("fetch", fetchMock);

    const client = createApiClient({ baseUrl: "https://example.com", timeoutMs: 5 });

    await expect(client.request({ path: "/slow" })).rejects.toBeInstanceOf(ApiError);
  });
});

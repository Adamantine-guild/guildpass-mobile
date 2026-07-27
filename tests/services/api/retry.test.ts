import { describe, expect, it, vi } from "vitest";
import { ApiError } from "../../../src/services/api/errors";
import {
  retryWithBackoff,
  shouldRetry,
  type RetryConfig,
} from "../../../src/services/api/retry";

const retryConfig: RetryConfig = {
  maxAttempts: 2,
  initialDelayMs: 1,
  maxDelayMs: 1,
};

function createApiError(retryable: boolean, message: string): ApiError {
  return new ApiError({
    code: retryable ? "server" : "validation",
    message,
    userMessage: "Request failed.",
    retryable,
  });
}

describe("API retry policy", () => {
  it("retries an ApiError when retryable is true", async () => {
    const operation = vi
      .fn()
      .mockRejectedValueOnce(createApiError(true, "Server error"))
      .mockResolvedValueOnce("success");

    await expect(retryWithBackoff(operation, retryConfig)).resolves.toBe("success");
    expect(operation).toHaveBeenCalledTimes(2);
  });

  it("does not retry an ApiError when retryable is false even if its message matches the heuristic", async () => {
    const error = createApiError(false, "Network timeout while fetching");
    const operation = vi.fn().mockRejectedValue(error);

    await expect(retryWithBackoff(operation, retryConfig)).rejects.toBe(error);
    expect(operation).toHaveBeenCalledTimes(1);
  });

  it("uses the message heuristic for non-ApiError errors", () => {
    expect(shouldRetry(new Error("Network request failed"))).toBe(true);
    expect(shouldRetry(new Error("Request timeout"))).toBe(true);
    expect(shouldRetry(new Error("fetch failed"))).toBe(true);
    expect(shouldRetry(new Error("Invalid input"))).toBe(false);
  });
});

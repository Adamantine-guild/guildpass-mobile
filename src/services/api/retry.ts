import { ApiError } from "./errors";

export interface RetryConfig {
  maxAttempts: number;
  initialDelayMs: number;
  maxDelayMs: number;
  backoffMultiplier?: number;
}

export const defaultRetryConfig: RetryConfig = {
  maxAttempts: 3,
  initialDelayMs: 200,
  maxDelayMs: 2000,
  backoffMultiplier: 2,
};

export function shouldRetry(error: unknown): boolean {
  if (error instanceof ApiError) {
    return error.retryable;
  }

  if (error instanceof Error && error.name === "AbortError") {
    return false;
  }

  if (error instanceof Error && /timeout|network|fetch/i.test(error.message)) {
    return true;
  }

  return false;
}

export async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

export async function retryWithBackoff<T>(
  operation: () => Promise<T>,
  config: RetryConfig,
  attempt = 1,
): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    const shouldRetryRequest = attempt < config.maxAttempts && shouldRetry(error);

    if (!shouldRetryRequest) {
      throw error;
    }

    const delay = Math.min(
      config.initialDelayMs * Math.pow(config.backoffMultiplier ?? 2, attempt - 1),
      config.maxDelayMs,
    );
    await sleep(delay);
    return retryWithBackoff(operation, config, attempt + 1);
  }
}

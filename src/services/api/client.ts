import { ApiError } from "./errors";
import { applyAuthInterceptor, type AuthConfig } from "./interceptors/authInterceptor";
import { defaultRetryConfig, retryWithBackoff, type RetryConfig } from "./retry";
import { parseJsonResponse } from "./response";

export interface ApiClientConfig {
  baseUrl: string;
  timeoutMs?: number;
  headers?: Record<string, string>;
  auth?: AuthConfig;
  retryConfig?: RetryConfig;
  feature?: string;
}

export interface RequestOptions {
  path: string;
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
  headers?: Record<string, string>;
  parseJson?: boolean;
  feature?: string;
  operation?: string;
}

function buildUrl(baseUrl: string, path: string): string {
  return `${baseUrl.replace(/\/$/, "")}${path.startsWith("/") ? path : `/${path}`}`;
}

function buildHeaders(headers: Record<string, string> | undefined, authHeader?: string): HeadersInit {
  const merged: Record<string, string> = {
    "content-type": "application/json",
    ...(headers ?? {}),
  };

  if (authHeader) {
    merged.Authorization = authHeader;
  }

  return merged;
}

export function createApiClient(config: ApiClientConfig) {
  const timeoutMs = config.timeoutMs ?? 10000;
  const retryConfig = config.retryConfig ?? defaultRetryConfig;

  const request = async <T = unknown>(options: RequestOptions): Promise<T> => {
    const url = buildUrl(config.baseUrl, options.path);
    const feature = options.feature ?? config.feature;
    const operation = options.operation;

    const requestFn = async (token: string | null) => {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

      try {
        const headers = buildHeaders(options.headers, token ?? undefined);

        const response = await fetch(url, {
          method: options.method ?? "GET",
          headers,
          body: options.body != null ? JSON.stringify(options.body) : undefined,
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          const errorPayload = await parseJsonResponse<unknown>(response);
          const errorMessage =
            typeof errorPayload.data === "object" && errorPayload.data != null && "message" in errorPayload.data
              ? String((errorPayload.data as { message?: string }).message)
              : response.statusText || "Request failed";

          throw new ApiError({
            code: response.status === 401 ? "unauthorized" : response.status === 403 ? "forbidden" : response.status === 404 ? "not_found" : response.status >= 500 ? "server" : "unknown",
            message: errorMessage,
            userMessage: errorMessage,
            status: response.status,
            retryable: response.status === 429 || (response.status >= 500 && response.status < 600),
            cause: errorPayload.data,
            feature,
            operation,
          });
        }

        const parsed = await parseJsonResponse<T>(response);
        return parsed.data;
      } catch (error) {
        clearTimeout(timeoutId);

        if (error instanceof ApiError) {
          throw error;
        }

        const normalizedError = error instanceof Error && error.name === "AbortError"
          ? new ApiError({
            code: "timeout",
            message: "Request timed out",
            userMessage: "The request timed out. Please try again.",
            status: undefined,
            retryable: true,
            cause: error,
            feature,
            operation,
          })
          : new ApiError({
            code: "network",
            message: error instanceof Error ? error.message : "Network request failed",
            userMessage: "We could not complete the request. Please try again.",
            retryable: true,
            cause: error,
            feature,
            operation,
          });

        throw normalizedError;
      }
    };

    return retryWithBackoff(
      () =>
        applyAuthInterceptor(
          requestFn,
          { auth: config.auth },
          feature,
          operation,
        ),
      retryConfig,
    );
  };

  return { request };
}

export type ApiErrorCode =
  | "network"
  | "timeout"
  | "unauthorized"
  | "forbidden"
  | "not_found"
  | "validation"
  | "server"
  | "unknown";

export interface ApiErrorShape {
  code: ApiErrorCode;
  message: string;
  userMessage: string;
  status?: number;
  retryable: boolean;
  cause?: unknown;
  feature?: string;
  operation?: string;
}

export interface ApiErrorContext {
  feature?: string;
  operation?: string;
}

export class ApiError extends Error implements ApiErrorShape {
  readonly code: ApiErrorCode;
  readonly userMessage: string;
  readonly status?: number;
  readonly retryable: boolean;
  readonly cause?: unknown;
  readonly feature?: string;
  readonly operation?: string;

  constructor({
    code,
    message,
    userMessage,
    status,
    retryable,
    cause,
    feature,
    operation,
  }: ApiErrorShape) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.userMessage = userMessage;
    this.status = status;
    this.retryable = retryable;
    this.cause = cause;
    this.feature = feature;
    this.operation = operation;
  }
}

function getErrorStatus(error: unknown): number | undefined {
  if (typeof error !== "object" || error === null) {
    return undefined;
  }

  const candidate = error as {
    status?: unknown;
    statusCode?: unknown;
    response?: { status?: unknown };
  };
  const status = candidate.status ?? candidate.statusCode ?? candidate.response?.status;

  return typeof status === "number" ? status : undefined;
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === "object" && error !== null && "message" in error) {
    return String((error as { message?: unknown }).message);
  }

  return typeof error === "string" ? error : "SDK request failed";
}

function codeFromStatus(status: number | undefined): ApiErrorCode | undefined {
  if (status === 401) return "unauthorized";
  if (status === 403) return "forbidden";
  if (status === 404) return "not_found";
  if (status === 400 || status === 422) return "validation";
  if (status === 429 || (status !== undefined && status >= 500)) return "server";
  return undefined;
}

function userMessageForCode(code: ApiErrorCode): string {
  switch (code) {
    case "timeout":
      return "The request timed out. Please try again.";
    case "unauthorized":
      return "Your session has expired. Please sign in again.";
    case "forbidden":
      return "You don't have permission to perform this action.";
    case "not_found":
      return "The requested resource could not be found.";
    case "validation":
      return "Some request information was invalid.";
    case "network":
    case "server":
    case "unknown":
      return "We could not complete the request. Please try again.";
  }
}

export function normalizeSdkError(
  error: unknown,
  context: ApiErrorContext = {},
): ApiError {
  if (error instanceof ApiError) {
    return error;
  }

  const status = getErrorStatus(error);
  const message = getErrorMessage(error);
  const isTimeout =
    (error instanceof Error && error.name === "AbortError") ||
    /timeout|timed out/i.test(message);
  const isNetworkError = /network|fetch|connection|offline/i.test(message);
  const code =
    codeFromStatus(status) ??
    (isTimeout ? "timeout" : isNetworkError ? "network" : "unknown");
  const retryable =
    isTimeout ||
    isNetworkError ||
    status === 429 ||
    (status !== undefined && status >= 500 && status < 600);

  return new ApiError({
    code,
    message,
    userMessage: userMessageForCode(code),
    status,
    retryable,
    cause: error,
    feature: context.feature,
    operation: context.operation,
  });
}

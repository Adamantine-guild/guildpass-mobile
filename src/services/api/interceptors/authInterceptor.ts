import { ApiError } from "../errors";

export interface AuthConfig {
  getAccessToken: () => Promise<string | null>;
  refreshAccessToken: () => Promise<string | null>;
  invalidateSession: () => void | Promise<void>;
}

export interface AuthContext {
  auth?: AuthConfig;
}

export async function applyAuthInterceptor<T>(
  request: (token: string | null) => Promise<T>,
  context: AuthContext,
  feature?: string,
  operation?: string,
): Promise<T> {
  const auth = context.auth;

  if (!auth) {
    return request(null);
  }

  const token = await auth.getAccessToken();
  if (!token) {
    return request(null);
  }

  try {
    return await request(token);
  } catch (error) {
    if (!(error instanceof ApiError) || error.status !== 401) {
      throw error;
    }

    let refreshedToken: string | null;
    try {
      refreshedToken = await auth.refreshAccessToken();
    } catch (refreshError) {
      await auth.invalidateSession();
      throw new ApiError({
        code: "unauthorized",
        message: "Session refresh failed",
        userMessage: "We could not refresh your session. Please sign in again.",
        status: 401,
        retryable: false,
        cause: refreshError,
        feature,
        operation,
      });
    }

    if (!refreshedToken) {
      await auth.invalidateSession();
      throw new ApiError({
        code: "unauthorized",
        message: "Session expired",
        userMessage: "Your session has expired. Please sign in again.",
        status: 401,
        retryable: false,
        cause: error,
        feature,
        operation,
      });
    }

    try {
      return await request(refreshedToken);
    } catch (retryError) {
      if (
        !(retryError instanceof ApiError) ||
        (retryError.status !== 401 && retryError.status !== 403)
      ) {
        throw retryError;
      }

      await auth.invalidateSession();
      throw new ApiError({
        code: "unauthorized",
        message: "Session refresh failed",
        userMessage: "We could not refresh your session. Please sign in again.",
        status: 401,
        retryable: false,
        cause: retryError,
        feature,
        operation,
      });
    }
  }
}

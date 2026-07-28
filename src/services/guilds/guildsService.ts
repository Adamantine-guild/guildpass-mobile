import { guildPassClient } from "../../lib/guildpassClient";
import {
  ApiError,
  normalizeSdkError,
  type ApiErrorContext,
} from "../api/errors";
import { defaultRetryConfig, retryWithBackoff } from "../api/retry";

const feature = "guilds";

export class GuildNotFoundError extends ApiError {
  constructor(guildId: string, cause?: unknown) {
    super({
      code: "not_found",
      message: `Guild not found: ${guildId}`,
      userMessage: "We couldn't find this guild.",
      status: 404,
      retryable: false,
      cause,
      feature,
      operation: "getGuild",
    });
    this.name = "GuildNotFoundError";
  }
}

async function executeSdkOperation<T>(
  operation: () => Promise<T>,
  context: ApiErrorContext,
): Promise<T> {
  return retryWithBackoff(
    async () => {
      try {
        return await operation();
      } catch (error) {
        throw normalizeSdkError(error, context);
      }
    },
    defaultRetryConfig,
  );
}

async function getGuild(guildId: string) {
  try {
    return await executeSdkOperation(
      () => guildPassClient.guilds.getGuild({ guildId }),
      { feature, operation: "getGuild" },
    );
  } catch (error) {
    const isNotFound =
      (error instanceof ApiError && error.code === "not_found") ||
      (error instanceof Error && /not found/i.test(error.message));
    if (isNotFound) {
      throw new GuildNotFoundError(guildId, error);
    }
    throw error;
  }
}

function getGuildConfig(guildId: string) {
  return executeSdkOperation(
    () => guildPassClient.guilds.getGuildConfig({ guildId }),
    { feature, operation: "getGuildConfig" },
  );
}

function getRoles(guildId: string) {
  return executeSdkOperation(
    () => guildPassClient.roles.getRoles({ guildId }),
    { feature, operation: "getRoles" },
  );
}

export const guildsService = {
  getGuild,
  getGuildConfig,
  getRoles,
};

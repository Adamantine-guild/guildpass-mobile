/**
 * sdk.mock.ts
 *
 * Centralised mock factory for @guildpass/sdk.
 *
 * All feature-hook tests import `createSdkMock` rather than inline-mocking the
 * SDK, so there is exactly one place to update when the SDK interface changes.
 * Each method is a `vi.fn()` so individual tests can override return values
 * with `.mockResolvedValueOnce()` and assert call signatures.
 *
 * Usage
 * -----
 *   import { createSdkMock, mockSdkModule } from '../fixtures/sdk.mock';
 *
 *   vi.mock('@guildpass/sdk', mockSdkModule);
 *
 *   // Inside a test:
 *   createSdkMock().guilds.getGuild.mockResolvedValueOnce(GUILD_DETAIL_FIXTURE);
 */

import { vi } from "vitest";
import {
  GUILD_DETAIL_FIXTURE,
  GUILD_CONFIG_FIXTURE,
  ROLES_LIST_FIXTURE,
  WALLET_GUILDS_FIXTURE,
} from "./guild.fixtures";
import { MEMBERSHIP_ACTIVE_FIXTURE, USER_ROLES_FIXTURE } from "./membership.fixtures";
import { ACCESS_GRANTED_FIXTURE } from "./access.fixtures";

// ---------------------------------------------------------------------------
// The canonical mock object shape.
// Each namespace mirrors the real SDK client structure used across the app:
//   client.guilds.*
//   client.roles.*
//   client.membership.*
//   client.access.*
// ---------------------------------------------------------------------------

export type SdkMock = {
  guilds: {
    getGuild: ReturnType<typeof vi.fn>;
    getGuildsByWalletAddress: ReturnType<typeof vi.fn>;
    getGuildConfig: ReturnType<typeof vi.fn>;
  };
  roles: {
    getRoles: ReturnType<typeof vi.fn>;
    getUserRoles: ReturnType<typeof vi.fn>;
  };
  membership: {
    getMembership: ReturnType<typeof vi.fn>;
  };
  access: {
    checkAccess: ReturnType<typeof vi.fn>;
  };
};

// Singleton: the same mock instance is reused between createSdkMock() calls
// within a test file so that `guildPassClient` (imported via the module) and
// the handle returned here both point to the same spy functions.
let _instance: SdkMock | null = null;

/**
 * Returns (or creates) the shared SDK mock instance.
 * Call this inside a test to access the spy functions and change return values.
 */
export function createSdkMock(): SdkMock {
  if (!_instance) {
    _instance = {
      guilds: {
        getGuild: vi.fn().mockResolvedValue(GUILD_DETAIL_FIXTURE),
        getGuildsByWalletAddress: vi.fn().mockResolvedValue(WALLET_GUILDS_FIXTURE),
        getGuildConfig: vi.fn().mockResolvedValue(GUILD_CONFIG_FIXTURE),
      },
      roles: {
        getRoles: vi.fn().mockResolvedValue(ROLES_LIST_FIXTURE),
        getUserRoles: vi.fn().mockResolvedValue(USER_ROLES_FIXTURE),
      },
      membership: {
        getMembership: vi.fn().mockResolvedValue(MEMBERSHIP_ACTIVE_FIXTURE),
      },
      access: {
        checkAccess: vi.fn().mockResolvedValue(ACCESS_GRANTED_FIXTURE),
      },
    };
  }
  return _instance;
}

/**
 * Resets all spy call history and restores default resolved values.
 * Call in beforeEach to isolate tests.
 */
export function resetSdkMock(): void {
  if (_instance) {
    _instance.guilds.getGuild.mockReset().mockResolvedValue(GUILD_DETAIL_FIXTURE);
    _instance.guilds.getGuildsByWalletAddress
      .mockReset()
      .mockResolvedValue(WALLET_GUILDS_FIXTURE);
    _instance.guilds.getGuildConfig.mockReset().mockResolvedValue(GUILD_CONFIG_FIXTURE);
    _instance.roles.getRoles.mockReset().mockResolvedValue(ROLES_LIST_FIXTURE);
    _instance.roles.getUserRoles.mockReset().mockResolvedValue(USER_ROLES_FIXTURE);
    _instance.membership.getMembership.mockReset().mockResolvedValue(MEMBERSHIP_ACTIVE_FIXTURE);
    _instance.access.checkAccess.mockReset().mockResolvedValue(ACCESS_GRANTED_FIXTURE);
  }
  // Also destroy the instance so the next createSdkMock() call rebuilds cleanly
  _instance = null;
}

/**
 * Pass this as the second arg to `vi.mock('@guildpass/sdk', mockSdkModule)`.
 * The factory returns a module whose named export `GuildPassClient` is a
 * constructor that always returns the shared mock instance.
 */
export function mockSdkModule() {
  return {
    GuildPassClient: vi.fn().mockImplementation(() => createSdkMock()),
  };
}

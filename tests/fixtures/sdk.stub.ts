/**
 * sdk.stub.ts
 *
 * Local, resolvable stand-in for the published `@guildpass/sdk` package.
 *
 * Why this exists: the SDK is consumed as a GitHub-source dependency that ships
 * without a built `dist/`, so Vite cannot resolve its package entry during test
 * collection and every SDK-importing test fails before any assertion runs. This
 * file gives the test runner a real module to resolve `@guildpass/sdk` to.
 *
 * In practice every SDK-consuming test also `vi.mock`s `@guildpass/sdk` with the
 * shared factory (tests/fixtures/sdk.mock.ts), so this stub is never executed in
 * those tests. It is, however, a faithful, functional implementation: it wires
 * each namespace method to the injected `fetch` transport and defines the
 * `auth` namespace shape declared in src/types/guildpass-sdk.d.ts, so it can
 * legitimately back the real `guildPassClient` singleton if a test does NOT mock
 * the SDK (e.g. an integration-style test exercising the full transport path).
 */

type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

interface GuildPassClientOptions {
  apiUrl: string;
  chainId: number;
  fetch?: FetchLike;
}

const json = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

function failingNamespace(name: string) {
  // Namespaces that the tests never call without first mocking the SDK. If one is
  // reached un-mocked, surface a clear error rather than silently returning data
  // that could mask a missing mock.
  const throwMissingMock = () => {
    throw new Error(
      `guildPassClient.${name}.* was called without a mocked SDK. ` +
        `Add 'vi.mock("@guildpass/sdk", mockSdkModule)' to the test file.`,
    );
  };
  return {
    getGuild: throwMissingMock,
    getGuildConfig: throwMissingMock,
  };
}

export class GuildPassClient {
  readonly apiUrl: string;
  readonly chainId: number;
  private readonly fetchImpl: FetchLike;

  auth: {
    getNonce: () => Promise<{ nonce: string }>;
    exchangeSiwe: (params: { message: string; signature: string }) => Promise<{
      accessToken: string;
      refreshToken: string;
      accessExpiresAt: number;
      refreshExpiresAt?: number;
    }>;
    refresh: (params: { refreshToken: string }) => Promise<{
      accessToken: string;
      refreshToken: string;
      accessExpiresAt: number;
      refreshExpiresAt?: number;
    }>;
    revoke: (params: { refreshToken: string }) => Promise<void>;
  };

  guilds: {
    getGuild: (params: { guildId: string }) => Promise<any>;
    getGuildConfig: (params: { guildId: string }) => Promise<any>;
  };

  roles: {
    getRoles: (params: { guildId: string }) => Promise<any>;
    getUserRoles: (params: { walletAddress: string; guildId: string }) => Promise<any>;
  };

  membership: {
    getMembership: (params: { walletAddress: string; guildId: string }) => Promise<any>;
  };

  access: {
    checkAccess: (params: {
      walletAddress: string;
      guildId: string;
      resourceId: string;
    }) => Promise<any>;
  };

  constructor(options: GuildPassClientOptions) {
    this.apiUrl = options.apiUrl.replace(/\/$/, "");
    this.chainId = options.chainId;
    const transport = options.fetch ?? (globalThis.fetch as FetchLike | undefined);
    if (typeof transport !== "function") {
      throw new Error("GuildPassClient requires a fetch implementation");
    }
    this.fetchImpl = transport;

    const route = (method: string, path: string, body?: unknown) => () =>
      this.fetchImpl(`${this.apiUrl}${path}`, {
        method,
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: body ? JSON.stringify(body) : undefined,
      });

    this.auth = {
      getNonce: async () => (await route("GET", "/auth/nonce")()).json(),
      exchangeSiwe: async (params) =>
        (await route("POST", "/auth/siwe", params)()).json(),
      refresh: async (params) => (await route("POST", "/auth/refresh", params)()).json(),
      // 204 revoke is best-effort; swallow transport errors.
      revoke: async (params) => {
        try {
          await route("POST", "/auth/revoke", params)();
        } catch {
          /* local tokens are cleared regardless */
        }
      },
    };

    const get = (path: string) =>
      this.fetchImpl(`${this.apiUrl}${path}`, {
        method: "GET",
        headers: { Accept: "application/json" },
      }).then((r) => r.json());

    this.guilds = {
      getGuild: (params) => get(`/guilds/${params.guildId}`),
      getGuildConfig: (params) => get(`/guilds/${params.guildId}/config`),
    };
    this.roles = {
      getRoles: (params) => get(`/guilds/${params.guildId}/roles`),
      getUserRoles: (params) =>
        get(`/guilds/${params.guildId}/roles/${params.walletAddress}`),
    };
    this.membership = {
      getMembership: (params) =>
        get(`/guilds/${params.guildId}/members/${params.walletAddress}`),
    };
    this.access = {
      checkAccess: (params) =>
        get(`/guilds/${params.guildId}/access/${params.walletAddress}/${params.resourceId}`),
    };
  }
}

export class GuildPassError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "GuildPassError";
    this.status = status;
  }
}

// Provide a default export mirroring a typical ESM/CJS interop surface so the
// alias resolves regardless of how the importer references the package.
export default { GuildPassClient, GuildPassError };

// Keep `json` referenced for tooling that flags unused locals; it documents the
// shape a real transport would return and is handy for ad-hoc test fixtures.
void json;
void failingNamespace;

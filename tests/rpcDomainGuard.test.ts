import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  classifyRpcDomain,
  RPC_DOMAIN_LOG_PREFIX,
  rpcUrlHostname,
  validateRpcDomain,
} from "../src/features/access/rpcDomainGuard";
import { getKnownRpcHostnames, isKnownRpcUrl } from "../src/config/rpcConfig";
import { resolveRoleEligibilityForChains } from "../src/features/access/roleEligibilityResolver";

const ALLOWLIST: Record<number, string[]> = {
  1: ["https://ethereum.example.com", "https://rpc-mainnet.example.com/v3/abc"],
  137: ["https://rpc-polygon.example.com"],
};

describe("rpcConfig allowlist helpers", () => {
  it("derives unique hostnames from the configured chainRpcUrls", () => {
    const hostnames = getKnownRpcHostnames(ALLOWLIST);
    expect([...hostnames]).toEqual(
      expect.arrayContaining([
        "ethereum.example.com",
        "rpc-mainnet.example.com",
        "rpc-polygon.example.com",
      ]),
    );
    expect(hostnames).not.toContain("rpc-mainnet.example.com/v3/abc");
  });

  it("classifies a known URL as allowlisted (chain-aware)", () => {
    expect(isKnownRpcUrl("https://ethereum.example.com", 1, ALLOWLIST)).toBe(true);
    expect(isKnownRpcUrl("https://ethereum.example.com/path", 1, ALLOWLIST)).toBe(true);
  });

  it("rejects a URL configured for a different chain", () => {
    expect(isKnownRpcUrl("https://ethereum.example.com", 137, ALLOWLIST)).toBe(false);
    expect(isKnownRpcUrl("https://rpc-polygon.example.com", 1, ALLOWLIST)).toBe(false);
  });

  it("treats hostnames case-insensitively", () => {
    expect(isKnownRpcUrl("https://ETHEREUM.Example.COM", 1, ALLOWLIST)).toBe(true);
  });

  it("rejects unknown and malformed URLs", () => {
    expect(isKnownRpcUrl("https://evil.example.com", 1, ALLOWLIST)).toBe(false);
    expect(isKnownRpcUrl("not-a-url", 1, ALLOWLIST)).toBe(false);
  });

  it("returns an empty allowlist when no RPC endpoints are configured", () => {
    expect(getKnownRpcHostnames({}).size).toBe(0);
    expect(isKnownRpcUrl("https://anything.example.com", 1, {})).toBe(false);
  });
});

describe("rpcDomainGuard", () => {
  const ALLOWED = "https://ethereum.example.com";
  const UNKNOWN = "https://evil.example.com";

  let warnSpy: ReturnType<typeof vi.spyOn>;
  let logSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    warnSpy.mockRestore();
    logSpy.mockRestore();
  });

  it("classifies an allowlisted endpoint as known", () => {
    expect(classifyRpcDomain(ALLOWED, 1, ALLOWLIST)).toBe("known");
  });

  it("classifies a non-allowlisted endpoint as unknown", () => {
    expect(classifyRpcDomain(UNKNOWN, 1, ALLOWLIST)).toBe("unknown");
  });

  it("logs a benign status line for a known endpoint and never warns", () => {
    const status = validateRpcDomain(ALLOWED, 1, ALLOWLIST);

    expect(status).toBe("known");
    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining(`${RPC_DOMAIN_LOG_PREFIX} Endpoint allowed by rpcConfig`),
    );
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it("flags an unknown endpoint with a distinct warning and does not log the known message", () => {
    const status = validateRpcDomain(UNKNOWN, 1, ALLOWLIST);

    expect(status).toBe("unknown");
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining(`${RPC_DOMAIN_LOG_PREFIX} Endpoint NOT in rpcConfig allowlist`),
    );
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("evil.example.com"),
      // chainId 1 is appended to the same message
    );
    expect(logSpy).not.toHaveBeenCalledWith(
      expect.stringContaining("Endpoint allowed by rpcConfig"),
    );
  });

  it("flattens to a hostname for logging an unparseable URL", () => {
    expect(rpcUrlHostname(UNKNOWN)).toBe("evil.example.com");
    expect(rpcUrlHostname("not-a-url")).toBe(null);
    expect(rpcUrlHostname(ALLOWED)).toBe("ethereum.example.com");
  });
});

describe("rpcDomainGuard through the resolver", () => {
  const defaultWallet = "0x1234567890123456789012345678901234567890";

  const timeouts = {
    roleResolverRpcAttemptTimeoutMs: 50,
    roleResolverPerChainTimeoutMs: 200,
    roleResolverBackoffBaseDelayMs: 10,
    roleResolverBackoffMaxDelayMs: 50,
    roleResolverMaxAttemptsPerEndpoint: 2,
    rpcStaleThresholdMs: 60000,
  };

  const rpcUrl = "https://rpc-mainnet.example.com";

  let fetchSpy: ReturnType<typeof vi.spyOn>;
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, "fetch");
    warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    fetchSpy.mockRestore();
    warnSpy.mockRestore();
  });

  it("flags an RPC URL not in the configured allowlist but still resolves (non-blocking)", async () => {
    fetchSpy.mockResolvedValue(
      new Response(
        JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          result: "0x0000000000000000000000000000000000000000000000000000000000000001",
        }),
        { status: 200 },
      ),
    );

    const result = await resolveRoleEligibilityForChains({
      walletAddress: defaultWallet,
      requirements: [
        {
          chainId: 1,
          requirement: {
            type: "ROLE",
            address: "0xabcdef0123456789abcdef0123456789abcdef01",
            id: "1",
          },
        },
      ],
      rpcsByChain: { 1: [rpcUrl] },
      timeouts,
    });

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining(`${RPC_DOMAIN_LOG_PREFIX} Endpoint NOT in rpcConfig allowlist`),
    );
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("rpc-mainnet.example.com"));
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      chainId: 1,
      status: "resolved",
      resolvedRoles: ["1"],
    });
  });

  it("validates the endpoint before dispatching the eth_call", async () => {
    fetchSpy.mockResolvedValue(
      new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, result: "0x00" }), { status: 200 }),
    );

    await resolveRoleEligibilityForChains({
      walletAddress: defaultWallet,
      requirements: [
        {
          chainId: 1,
          requirement: {
            type: "ROLE",
            address: "0xabcdef0123456789abcdef0123456789abcdef01",
            id: "1",
          },
        },
      ],
      rpcsByChain: { 1: [rpcUrl] },
      timeouts,
    });

    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("chainId 1"));
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(String(fetchSpy.mock.calls[0][0])).toBe(rpcUrl);
  });
});

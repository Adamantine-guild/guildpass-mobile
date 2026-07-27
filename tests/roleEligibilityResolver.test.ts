import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  resolveRoleEligibilityForChains,
  type AccessRequirement,
} from "../src/features/access/roleEligibilityResolver";

describe("roleEligibilityResolver", () => {
  const defaultWallet = "0x1234567890123456789012345678901234567890";

  const validRoleRequirement: AccessRequirement = {
    type: "ROLE",
    address: "0xabcdef0123456789abcdef0123456789abcdef01",
    id: "1",
  };

  const timeouts = {
    roleResolverRpcAttemptTimeoutMs: 50,
    roleResolverPerChainTimeoutMs: 200,
    roleResolverBackoffBaseDelayMs: 10,
    roleResolverBackoffMaxDelayMs: 50,
    roleResolverMaxAttemptsPerEndpoint: 2,
    rpcStaleThresholdMs: 60000,
  };

  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, "fetch");
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it("resolves role eligibility successfully for a single chain when RPC returns true", async () => {
    fetchSpy.mockResolvedValueOnce(
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
      requirements: [{ chainId: 1, requirement: validRoleRequirement }],
      rpcsByChain: { 1: ["https://rpc-mainnet.example.com"] },
      timeouts,
    });

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      chainId: 1,
      status: "resolved",
      resolvedRoles: ["1"],
    });
  });

  it("resolves with empty roles when RPC returns false (0x0)", async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          result: "0x0000000000000000000000000000000000000000000000000000000000000000",
        }),
        { status: 200 },
      ),
    );

    const result = await resolveRoleEligibilityForChains({
      walletAddress: defaultWallet,
      requirements: [{ chainId: 1, requirement: validRoleRequirement }],
      rpcsByChain: { 1: ["https://rpc-mainnet.example.com"] },
      timeouts,
    });

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      chainId: 1,
      status: "resolved",
      resolvedRoles: [],
    });
  });

  it("supports multiple chains in parallel using Promise.allSettled aggregation", async () => {
    fetchSpy.mockImplementation(async (url) => {
      const urlStr = String(url);
      if (urlStr.includes("ethereum")) {
        return new Response(
          JSON.stringify({
            jsonrpc: "2.0",
            id: 1,
            result: "0x0000000000000000000000000000000000000000000000000000000000000001",
          }),
        );
      }
      if (urlStr.includes("polygon")) {
        return new Response(
          JSON.stringify({
            jsonrpc: "2.0",
            id: 1,
            result: "0x0000000000000000000000000000000000000000000000000000000000000000",
          }),
        );
      }
      throw new Error("Unexpected URL");
    });

    const result = await resolveRoleEligibilityForChains({
      walletAddress: defaultWallet,
      requirements: [
        { chainId: 1, requirement: validRoleRequirement },
        { chainId: 137, requirement: { ...validRoleRequirement, id: "2" } },
      ],
      rpcsByChain: {
        1: ["https://ethereum.example.com"],
        137: ["https://polygon.example.com"],
      },
      timeouts,
    });

    expect(result).toHaveLength(2);
    const ethRes = result.find((r) => r.chainId === 1);
    const polyRes = result.find((r) => r.chainId === 137);

    expect(ethRes).toEqual({
      chainId: 1,
      status: "resolved",
      resolvedRoles: ["1"],
    });
    expect(polyRes).toEqual({
      chainId: 137,
      status: "resolved",
      resolvedRoles: [],
    });
  });

  it("falls back to the next RPC endpoint with backoff when the primary RPC fails", async () => {
    fetchSpy
      .mockRejectedValueOnce(new Error("Primary RPC connection refused"))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            jsonrpc: "2.0",
            id: 1,
            result: "0x0000000000000000000000000000000000000000000000000000000000000001",
          }),
        ),
      );

    const result = await resolveRoleEligibilityForChains({
      walletAddress: defaultWallet,
      requirements: [{ chainId: 1, requirement: validRoleRequirement }],
      rpcsByChain: {
        1: ["https://rpc-primary.example.com", "https://rpc-fallback.example.com"],
      },
      timeouts,
    });

    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(result[0]).toEqual({
      chainId: 1,
      status: "resolved",
      resolvedRoles: ["1"],
    });
  });

  it("reports status 'timed-out' when RPC attempt exceeds timeout", async () => {
    fetchSpy.mockImplementationOnce(
      () => new Promise((resolve) => setTimeout(resolve, 200)),
    );

    const result = await resolveRoleEligibilityForChains({
      walletAddress: defaultWallet,
      requirements: [{ chainId: 1, requirement: validRoleRequirement }],
      rpcsByChain: { 1: ["https://slow-rpc.example.com"] },
      timeouts: { ...timeouts, roleResolverRpcAttemptTimeoutMs: 30 },
    });

    expect(result[0].chainId).toBe(1);
    expect(result[0].status).toBe("timed-out");
    expect(result[0].errorMessage).toContain("timed out");
  });

  it("returns error status for unsupported requirement types (e.g. TOKEN or NFT)", async () => {
    const tokenRequirement: AccessRequirement = {
      type: "TOKEN",
      address: "0xabcdef0123456789abcdef0123456789abcdef01",
      minAmount: "100",
    };

    const result = await resolveRoleEligibilityForChains({
      walletAddress: defaultWallet,
      requirements: [{ chainId: 1, requirement: tokenRequirement }],
      rpcsByChain: { 1: ["https://rpc-mainnet.example.com"] },
      timeouts,
    });

    expect(result[0].chainId).toBe(1);
    expect(result[0].status).toBe("error");
    expect(result[0].errorMessage).toContain("Unsupported requirement type");
  });

  it("handles 0x-prefixed 32-byte hex role IDs correctly", async () => {
    const hexRoleRequirement: AccessRequirement = {
      type: "ROLE",
      address: "0xabcdef0123456789abcdef0123456789abcdef01",
      id: "0x0000000000000000000000000000000000000000000000000000000000000042",
    };

    fetchSpy.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          result: "0x0000000000000000000000000000000000000000000000000000000000000001",
        }),
      ),
    );

    const result = await resolveRoleEligibilityForChains({
      walletAddress: defaultWallet,
      requirements: [{ chainId: 1, requirement: hexRoleRequirement }],
      rpcsByChain: { 1: ["https://rpc-mainnet.example.com"] },
      timeouts,
    });

    expect(result[0]).toEqual({
      chainId: 1,
      status: "resolved",
      resolvedRoles: ["0x0000000000000000000000000000000000000000000000000000000000000042"],
    });
  });
});

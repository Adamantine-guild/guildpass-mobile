import { getRpcsForChain, rpcConfig } from "../../config/rpcConfig";
import type { RpcConfig } from "../../config/rpcConfig";

// Keep local to the app: @guildpass/sdk typings are currently loose.
export type AccessRequirement = {
  type: "TOKEN" | "NFT" | "ROLE" | "WHITELIST";
  address?: string;
  id?: string;
  minAmount?: string;
};

export type RoleRequirementOnChain = {
  chainId: number;
  requirement: AccessRequirement;
};

export type RoleEligibilityStatus = "resolved" | "timed-out" | "error";

export type PerChainRoleEligibilityResolution = {
  chainId: number;
  status: RoleEligibilityStatus;
  resolvedRoles?: string[];
  errorMessage?: string;
};

export type ResolveRoleEligibilityInput = {
  walletAddress: string;
  requirements: RoleRequirementOnChain[];
  /** Optional override to bypass rpcConfig (useful in tests). */
  rpcsByChain?: Record<number, string[]>;
  /** Optional override to bypass default timeouts/backoff (useful in tests). */
  timeouts?: RpcConfig["timeouts"];
};

type EthCallFn = (rpcUrl: string, payload: unknown) => Promise<unknown>;

type JsonRpcSuccess = { result?: unknown };
type JsonRpcError = { error?: { message?: string } };
type JsonRpcResponse = JsonRpcSuccess & JsonRpcError;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const id = setTimeout(() => reject(new Error(`RPC attempt timed out after ${ms}ms`)), ms);
    promise
      .then((v) => {
        clearTimeout(id);
        resolve(v);
      })
      .catch((e) => {
        clearTimeout(id);
        reject(e);
      });
  });
}

function buildRoleRequirementCallData(requirement: AccessRequirement): { to: string; data: string } {
  // NOTE: This is a simplified encoder that matches the SDK patch contractClient
  // behaviour for ROLE requirements only.
  // For TOKEN/NFT/WHITELIST we cannot reconstruct ABI safely without importing
  // SDK contract helpers; instead we throw so the UI reports per-chain partial failure.
  if (requirement.type !== "ROLE") {
    throw new Error(`On-chain RPC role eligibility is only implemented for ROLE requirements; got ${requirement.type}`);
  }

  const to = requirement.address;
  const roleId = requirement.id;

  if (!to || typeof to !== "string") {
    throw new Error('ROLE requirement missing "address"');
  }
  if (!roleId || typeof roleId !== "string") {
    throw new Error('ROLE requirement missing "id"');
  }

  // SDK patch uses: hasRole(bytes32,address) selector 0x91d14854, then bytes32(roleId) + address argument.
  const HAS_ROLE_SELECTOR = "0x91d14854";

  // bytes32 encoding: accept 0x-prefixed 32-byte hex OR decimal integer string OR short UTF-8.
  // Here we only accept 0x...64 hex or decimal integer.
  const roleIdHex = roleId.startsWith("0x") ? roleId.toLowerCase() : roleId;
  const bytes32 = (() => {
    if (/^0x[a-fA-F0-9]{64}$/.test(roleIdHex)) return roleIdHex.slice(2);
    if (/^\d+$/.test(roleId)) {
      const hex = BigInt(roleId).toString(16);
      return hex.padStart(64, "0");
    }
    throw new Error(`Unsupported ROLE id encoding for role requirement: ${roleId}`);
  })();

  const addr = (() => {
    if (!/^0x[a-fA-F0-9]{40}$/.test(requirement.address ?? "")) {
      // best-effort: allow lowercasing without strict validation
      throw new Error(`Invalid ROLE contract address: ${requirement.address}`);
    }
    return requirement.address!.slice(2).toLowerCase().padStart(64, "0");
  })();

  const data = `${HAS_ROLE_SELECTOR}${bytes32}${addr}`;
  return { to, data };
}

async function rpcEthCall(rpcUrl: string, to: string, data: string): Promise<boolean> {
  const payload = {
    jsonrpc: "2.0",
    id: 1,
    method: "eth_call",
    params: [{ to, data }, "latest"],
  };

  const res = (await fetch(rpcUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  }).then((r) => r.json())) as JsonRpcResponse;

  if (res.error) {
    throw new Error(res.error.message ?? "RPC provider error");
  }

  const resultHex = res.result;
  if (typeof resultHex !== "string") {
    throw new Error("RPC returned non-string eth_call result");
  }

  // bool decoding: SDK patch uses: BigInt(result) !== 0n
  try {
    return BigInt(resultHex) !== 0n;
  } catch {
    throw new Error("RPC returned invalid bool value");
  }
}

async function resolveChainRoleEligibility(params: {
  walletAddress: string;
  chainId: number;
  roleRequirements: AccessRequirement[];
  rpcs: string[];
  timeouts: RpcConfig["timeouts"];
}): Promise<PerChainRoleEligibilityResolution> {
  const { walletAddress, chainId, roleRequirements, rpcs, timeouts } = params;

  if (roleRequirements.length === 0) {
    return { chainId, status: "resolved", resolvedRoles: [] };
  }

  // Only ROLE requirements are supported in this simplified encoder.
  // Other requirement types will fail fast and be reported.
  const supportedRequirements: AccessRequirement[] = [];
  for (const r of roleRequirements) {
    if (r.type === "ROLE") supportedRequirements.push(r);
    else throw new Error(`Unsupported requirement type for RPC resolution: ${r.type}`);
  }

  for (let endpointIdx = 0; endpointIdx < rpcs.length; endpointIdx++) {
    const rpcUrl = rpcs[endpointIdx];

    try {
      const roleChecks = supportedRequirements.map(async (req) => {
        const { to, data } = buildRoleRequirementCallData(req);
        const hasRole = await withTimeout(
          rpcEthCall(rpcUrl, to, data),
          timeouts.roleResolverRpcAttemptTimeoutMs,
        );
        return { id: req.id ?? "", hasRole };
      });

      const results = await withTimeout(
        Promise.all(roleChecks),
        timeouts.roleResolverPerChainTimeoutMs,
      );

      const resolvedRoles = results
        .filter((r) => r.hasRole && r.id)
        .map((r) => r.id);

      return { chainId, status: "resolved", resolvedRoles };
    } catch (e: any) {
      // fall through to next endpoint; apply exponential backoff before retrying a new endpoint
      const attempt = endpointIdx + 1;
      if (attempt < timeouts.roleResolverMaxAttemptsPerEndpoint + 1) {
        const delayMs = Math.min(
          timeouts.roleResolverBackoffBaseDelayMs * 2 ** (attempt - 1),
          timeouts.roleResolverBackoffMaxDelayMs,
        );
        await sleep(delayMs);
      }

      if (endpointIdx === rpcs.length - 1) {
        const msg = e instanceof Error ? e.message : String(e);
        // Distinguish timeouts in UX
        const isTimeout = /timed out/i.test(msg) || /Timeout/i.test(msg);
        return {
          chainId,
          status: isTimeout ? "timed-out" : "error",
          errorMessage: msg,
        };
      }
    }
  }

  return { chainId, status: "error", errorMessage: "No RPC endpoints configured" };
}

export async function resolveRoleEligibilityForChains(
  input: ResolveRoleEligibilityInput,
): Promise<PerChainRoleEligibilityResolution[]> {
  const {
    walletAddress,
    requirements,
    rpcsByChain = {},
    timeouts = rpcConfig.timeouts,
  } = input;

  const byChain = new Map<number, AccessRequirement[]>();
  for (const { chainId, requirement } of requirements) {
    const arr = byChain.get(chainId) ?? [];
    arr.push(requirement);
    byChain.set(chainId, arr);
  }

  const perChainTasks: Array<Promise<PerChainRoleEligibilityResolution>> = [];
  for (const [chainId, roleRequirements] of byChain.entries()) {
    const rpcs = (rpcsByChain[chainId] ?? getRpcsForChain(chainId)).filter(Boolean);

    perChainTasks.push(
      resolveChainRoleEligibility({
        walletAddress,
        chainId,
        roleRequirements,
        rpcs,
        timeouts,
      }).catch((e) => {
        const msg = e instanceof Error ? e.message : String(e);
        const isTimeout = /timed out/i.test(msg) || /Timeout/i.test(msg);
        return {
          chainId,
          status: isTimeout ? "timed-out" : "error",
          errorMessage: msg,
        };
      }),
    );
  }

  const settled = await Promise.allSettled(perChainTasks);

  return settled.map((s) =>
    s.status === "fulfilled"
      ? s.value
      : {
          chainId: -1,
          status: "error",
          errorMessage: s.reason instanceof Error ? s.reason.message : String(s.reason),
        },
  );
}


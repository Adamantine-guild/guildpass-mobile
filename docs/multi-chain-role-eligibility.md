# Multi-Chain Role Eligibility Resolution

## Overview

The Multi-Chain Role Eligibility Resolver enables `guildpass-mobile` to evaluate on-chain role requirements across multiple EVM blockchain networks concurrently. It uses direct RPC queries with automatic endpoint fallback, exponential backoff, per-chain timeout bounds, and `Promise.allSettled` aggregation to ensure resilient user access resolution even under degraded network conditions.

---

## Architecture & Data Flow

```
[Access Check Request]
         │
         ▼
[useMultiChainRoleEligibility] ──> [buildRoleEligibilityResolutionPlan]
                                                │ (Group by chainId)
                                                ▼
                             [resolveRoleEligibilityForChains]
                                                │
                          ┌─────────────────────┴─────────────────────┐
                          ▼                                           ▼
            [Chain A: RPC Primary -> Fallback]           [Chain B: RPC Primary -> Fallback]
                          │                                           │
                          ▼                                           ▼
                (Promise.allSettled) ──────────────────────> Aggregate Results
                                                                      │
                                                                      ▼
                                                       [PerChainEligibilityList UI]
```

1. **Resolution Planning**: `buildRoleEligibilityResolutionPlan` extracts requirements from fetched guild roles and checks that each role has a valid positive integer `chainId`. Missing configurations surface early as per-chain errors without sending invalid network requests.
2. **Parallel Dispatch**: Requirements are grouped by `chainId`. Each chain execution runs in parallel using `Promise.allSettled`. Failures or delays on one chain do not block resolution of other chains.
3. **RPC Execution**: For each chain, `rpcEthCall` queries the `hasRole(bytes32,address)` EVM function (`0x91d14854`).
4. **UI Aggregation**: Per-chain resolution results (`resolved`, `timed-out`, or `error`) are rendered in `AccessCheck` screen via `PerChainEligibilityList`.

---

## RPC Fallback & Resilience Strategy

### Endpoint Fallback Iteration
For each target chain, RPC endpoints are ordered by priority:
- Primary RPC endpoint (e.g., dedicated alchemy/infura/quicknode node)
- Public fallback RPC endpoints (e.g., `https://cloudflare-eth.com`, chain default endpoints)

If the primary endpoint rejects requests, returns JSON-RPC errors, or fails to respond within the attempt timeout, the resolver logs the attempt and seamlessly switches to the next fallback endpoint in the chain configuration list.

### Exponential Backoff Delay
Before attempting a subsequent fallback endpoint on transient failure:
$$\text{delayMs} = \min\left(\text{baseDelay} \times 2^{\text{attempt} - 1}, \text{maxDelay}\right)$$

Default parameters:
- `roleResolverRpcAttemptTimeoutMs`: **5,000 ms** (per RPC attempt)
- `roleResolverPerChainTimeoutMs`: **15,000 ms** (total timeout for a single chain)
- `roleResolverBackoffBaseDelayMs`: **250 ms**
- `roleResolverBackoffMaxDelayMs`: **2,000 ms**
- `roleResolverMaxAttemptsPerEndpoint`: **3**

---

## Performance Characteristics

| Metric | Target / Benchmark | Optimization Mechanism |
|--------|-------------------|-----------------------|
| Single Chain Latency | ~150ms - 400ms | Direct JSON-RPC `eth_call` payload without full web3 provider overhead |
| Multi-Chain (3 chains) Latency | ~200ms - 500ms | Parallel execution via `Promise.allSettled` |
| Primary RPC Outage Recovery | +250ms backoff + attempt timeout | Automatic fallback endpoint retry |
| Memory Footprint | Low (< 50KB heap allocation per check) | Lightweight fetch-based JSON-RPC encoder |
| Partial Network Failure Resilience | Graceful degraded state | Returns `timed-out` / `error` per-chain status without crashing UI |

---

## Per-Chain Status Definitions

- `resolved`: All role requirements for the chain were successfully evaluated. `resolvedRoles` contains the list of verified role IDs.
- `timed-out`: RPC request exceeded attempt or chain timeout limits. Displayed in UI with warning badge (`bg-amber-100` / `dark:bg-amber-900/30`).
- `error`: Unrecoverable network error, missing RPC endpoints, or unsupported requirement format. Displayed in UI with error badge (`bg-error/10` / `dark:bg-red-900/30`).

---

## Code References

- **Resolver Implementation**: [`roleEligibilityResolver.ts`](file:///c:/Users/DELL/Downloads/Rogut%20Omni%20Channel%20Mock%20API/guildpass-mobile/src/features/access/roleEligibilityResolver.ts)
- **Hook Integration**: [`useMultiChainRoleEligibility.ts`](file:///c:/Users/DELL/Downloads/Rogut%20Omni%20Channel%20Mock%20API/guildpass-mobile/src/features/access/useMultiChainRoleEligibility.ts)
- **UI Component**: [`AccessCheck Screen`](file:///c:/Users/DELL/Downloads/Rogut%20Omni%20Channel%20Mock%20API/guildpass-mobile/app/access-check.tsx#L36-L96)
- **Unit Tests**: [`roleEligibilityResolver.test.ts`](file:///c:/Users/DELL/Downloads/Rogut%20Omni%20Channel%20Mock%20API/guildpass-mobile/tests/roleEligibilityResolver.test.ts)

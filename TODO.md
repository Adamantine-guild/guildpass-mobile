# TODO: Multi-chain role eligibility resolution with RPC fallback

## Plan (from feature requirement)

1. Locate current role eligibility / multi-chain checks usage in app (screens, stores, SDK calls).
2. Implement new resolver module in `src/features/access/`:
   - Accept list of `(chainId, requirement)`.
   - Parallel requests via `Promise.allSettled`.
   - Per-chain timeout.
   - Primary + fallback RPC endpoint list.
   - Exponential backoff for transient RPC failures.
   - Aggregate results as they resolve.
3. Integrate resolver into the access-resolution flow used by the access-check screen (and any multi-chain role UI).
4. Update UI to show per-chain status: resolved / timed-out / error.
5. Add unit tests for resolver (timeout, fallback, backoff, allSettled aggregation).
6. Add UI/flow tests for partial failure rendering.
7. Document performance characteristics in `docs/`.

## Progress

- [x] Repo reconnaissance: reviewed `useAccessCheck`, `access-check` screen, `guild detail` screen, and core access-related hooks.
- [x] Locate where backend roles/eligibility requirements are computed for access-check.
- [x] Implement resolver module + integration points.
- [x] Add tests (`roleEligibilityResolver.test.ts`, `useMultiChainRoleEligibility.test.ts`, `accessCheckScreen.test.tsx`).
- [x] Add docs (`docs/multi-chain-role-eligibility.md`).

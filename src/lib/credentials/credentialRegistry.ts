/**
 * Discovery registry for credential issuer implementations.
 *
 * This exists so a future credential kind can be added by registering it here
 * instead of editing a hardcoded list, and so tooling can enumerate what the app
 * knows how to verify.
 *
 * It is NOT on the verification path — and must not become so.
 * `getGuildIssuerPublicKey()` and `checkIssuerKeyRevoked()` call their own
 * module-local registry objects directly. Routing live verification through this
 * map would make access gating depend on bootstrap ordering: a credential checked
 * before `registerBuiltInIssuers()` ran would throw rather than fail closed, and a
 * deep link or restored screen can reach a verification path before the root
 * layout has finished mounting. Discovery may depend on bootstrap; gating may not.
 */

import type { CredentialIssuerRegistry, CredentialKind } from "./credentialIssuer.types";

const registries = new Map<CredentialKind, CredentialIssuerRegistry>();

/**
 * Register an implementation for a credential kind.
 *
 * Re-registering the same kind replaces the previous entry — bootstrap is
 * idempotent, so a second call during a fast refresh must not throw.
 */
export function registerCredentialIssuerRegistry(registry: CredentialIssuerRegistry): void {
  registries.set(registry.credentialKind, registry);
}

/** Look up a registered implementation, or `undefined` if none is registered. */
export function tryGetCredentialIssuerRegistry(
  kind: CredentialKind,
): CredentialIssuerRegistry | undefined {
  return registries.get(kind);
}

/**
 * Look up a registered implementation, throwing when the kind is unknown.
 *
 * For discovery callers that legitimately cannot proceed. Never use this to gate
 * access — see the module note.
 */
export function getCredentialIssuerRegistry(kind: CredentialKind): CredentialIssuerRegistry {
  const registry = registries.get(kind);
  if (registry === undefined) {
    throw new Error(`No credential issuer registry is registered for kind "${kind}".`);
  }
  return registry;
}

/** Every registered implementation, in registration order. */
export function listCredentialIssuerRegistries(): CredentialIssuerRegistry[] {
  return Array.from(registries.values());
}

/** Test-only: drop all registrations so suites start from a known state. */
export function resetCredentialIssuerRegistries(): void {
  registries.clear();
}

import type { QueryClient } from "@tanstack/react-query";

export const walletScopedQueryRoots = new Set(["membership", "memberships", "user-roles"]);
const walletScopedMutationRoots = new Set(["access-check"]);

function isWalletScopedQuery(queryKey: readonly unknown[]): boolean {
  return typeof queryKey[0] === "string" && walletScopedQueryRoots.has(queryKey[0]);
}

function isWalletScopedMutation(mutationKey: readonly unknown[] | undefined): boolean {
  return typeof mutationKey?.[0] === "string" && walletScopedMutationRoots.has(mutationKey[0]);
}

export function clearWalletScopedCache(client: QueryClient): void {
  client.removeQueries({ predicate: (query) => isWalletScopedQuery(query.queryKey) });
  client
    .getMutationCache()
    .findAll({ predicate: (mutation) => isWalletScopedMutation(mutation.options.mutationKey) })
    .forEach((mutation) => client.getMutationCache().remove(mutation));
}

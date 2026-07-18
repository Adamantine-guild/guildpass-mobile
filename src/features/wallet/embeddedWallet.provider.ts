/**
 * Local preview embedded-wallet provider (Issue #104).
 *
 * Mirrors the app's MVP conventions (noopSessionAdapter, manual connector):
 * it gives non-crypto-native users a working onboarding path today while the
 * interface stays ready for a production provider (Web3Auth, Privy, …).
 *
 * What it does:
 *   - "Logs in" with a validated email address (no real OAuth round-trip;
 *     Google/Apple methods throw until a production provider is configured).
 *   - Derives a DETERMINISTIC preview address from the identity, so the same
 *     email always maps to the same address across sessions and devices.
 *
 * What it deliberately does NOT do — see SECURITY.md ("Embedded Wallet Key
 * Custody"): it never generates, stores, or persists any key material or
 * identity data. The preview address cannot sign anything; it exists so
 * membership/access-check flows work end-to-end. A production provider
 * replaces the derivation with real custodial/MPC key provisioning behind
 * the same interface, and revokes its local key shares in logout().
 */

import { z } from "zod";
import type {
  EmbeddedWalletProvider,
  SocialIdentity,
  SocialLoginMethod,
  SocialLoginParams,
} from "./embeddedWallet.types";

const EmailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .email("Please enter a valid email address.");

function fnv1a(input: string, seed: number): number {
  let hash = seed >>> 0;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

const LANE_SEEDS = [0x811c9dc5, 0x01935ca3, 0x7fe0ffb1, 0x23a1c9b5, 0x5bd1e995] as const;

/**
 * Expands an identity seed into a 20-byte hex address (5 independent 32-bit
 * FNV-1a lanes). Deterministic and lowercase, so it round-trips through
 * validateAndNormalizeAddress like any externally-provided address.
 * Non-cryptographic — acceptable only because the preview address carries no
 * signing authority (see SECURITY.md).
 */
export function deriveDeterministicAddress(seed: string): string {
  const hex = LANE_SEEDS.map((laneSeed, lane) =>
    fnv1a(`${lane}|${seed}`, laneSeed).toString(16).padStart(8, "0"),
  ).join("");
  return `0x${hex}`;
}

/** EXPO_PUBLIC_* vars are inlined into the bundle per EAS build profile. */
function isProductionBuild(): boolean {
  return process.env.EXPO_PUBLIC_APP_ENV === "production";
}

export const localEmbeddedWalletProvider: EmbeddedWalletProvider = {
  name: "local-preview",
  custody: "device",

  async login(method: SocialLoginMethod, params?: SocialLoginParams): Promise<SocialIdentity> {
    if (isProductionBuild()) {
      // Fail-closed tripwire: the preview provider performs no identity
      // verification and must never ship as the production onboarding path.
      throw new Error(
        "Social login is not available in this build. A verified embedded wallet provider must be configured for production.",
      );
    }
    if (method !== "email") {
      throw new Error(
        `${method} login is not configured yet. Connect a production embedded wallet provider (e.g. Web3Auth or Privy) to enable it.`,
      );
    }
    const parsed = EmailSchema.safeParse(params?.email ?? "");
    if (!parsed.success) {
      throw new Error(parsed.error.issues[0]?.message ?? "Please enter a valid email address.");
    }
    return { method: "email", subject: parsed.data, email: parsed.data };
  },

  async provisionWallet(identity: SocialIdentity): Promise<{ address: string }> {
    return { address: deriveDeterministicAddress(`${identity.method}|${identity.subject}`) };
  },

  async logout(): Promise<void> {
    // Nothing is persisted by the preview provider. A production provider
    // revokes its session and local key shares here.
  },
};

/**
 * Swap-in point for a production provider: replace the returned instance
 * (or select by app config) without touching the UI or connector layers.
 */
export function getEmbeddedWalletProvider(): EmbeddedWalletProvider {
  return localEmbeddedWalletProvider;
}

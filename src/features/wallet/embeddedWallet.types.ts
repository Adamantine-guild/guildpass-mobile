/**
 * Embedded wallet / social login domain types (Issue #104).
 *
 * The provider interface is deliberately SDK-agnostic: a production
 * integration (Web3Auth, Privy, or similar) implements the same contract the
 * local preview provider does, so swapping providers never touches the
 * onboarding UI, the connector layer, or the wallet store.
 */

export type SocialLoginMethod = "email" | "google" | "apple";

/** The authenticated identity a social login resolves to. */
export type SocialIdentity = {
  method: SocialLoginMethod;
  /** Stable unique identifier within the method (normalized email, OAuth subject). */
  subject: string;
  email?: string;
};

export type EmbeddedWalletCustody = "device" | "custodial" | "mpc";

export type SocialLoginParams = {
  email?: string;
};

/**
 * Contract every embedded wallet provider must satisfy.
 *
 * login()            – authenticate the user via the given social method.
 *                      Providers should restore an existing session silently
 *                      when possible rather than forcing interactive auth.
 * provisionWallet()  – return (creating if needed) the wallet address bound
 *                      to that identity. Same identity ⇒ same address.
 * logout()           – revoke/drop any locally-held session or key material.
 *                      Must be idempotent; wallet disconnect and app reset
 *                      call it unconditionally.
 */
export interface EmbeddedWalletProvider {
  name: string;
  custody: EmbeddedWalletCustody;
  login(method: SocialLoginMethod, params?: SocialLoginParams): Promise<SocialIdentity>;
  provisionWallet(identity: SocialIdentity): Promise<{ address: string }>;
  logout(): Promise<void>;
}

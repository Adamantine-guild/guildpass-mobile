/**
 * Sign-In With Ethereum (EIP-4361) message types.
 *
 * The message is the exact string the wallet signs. Its byte-for-byte format is
 * a wire contract shared with the backend verifier: the same fields, in the same
 * order, with the same labels. Changing the format is a breaking change for
 * every issued sign-in. See `siwe.ts` for the canonical serialization.
 *
 * Reference: https://eips.ethereum.org/EIPS/eip-4361
 */

/** Fields required to construct a SIWE message. */
export interface SiweParams {
  /** RFC 4501 dnsauthority requesting the sign-in, e.g. "app.guildpass.xyz". */
  domain: string;
  /** EIP-55 checksummed (or lower-case) EVM address performing the sign-in. */
  address: string;
  /** Human-readable assertion the user signs, e.g. "Sign in to GuildPass". */
  statement: string;
  /** RFC 3986 URI referring to the resource that is the subject of the sign-in. */
  uri: string;
  /** EIP-4361 version. Currently always "1". */
  version: string;
  /** EIP-155 chain ID the sign-in is scoped to. */
  chainId: number;
  /** Server-issued single-use nonce (>= 8 alphanumeric chars) for replay protection. */
  nonce: string;
  /** ISO-8601 timestamp the message was generated. */
  issuedAt: string;
  /** Optional ISO-8601 timestamp after which the message is no longer valid. */
  expirationTime?: string;
}

/** A fully-parsed SIWE message. Mirrors {@link SiweParams} — parse ∘ build = id. */
export type SiweMessage = SiweParams;

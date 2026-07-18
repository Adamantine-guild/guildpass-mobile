/**
 * Validates and normalises an Ethereum wallet address.
 *
 * Format: `/^0x[0-9a-fA-F]{40}$/`.
 * Mixed-case addresses must satisfy EIP-55 checksum casing.
 * All-lowercase / all-uppercase (after `0x`) are accepted without a checksum.
 */

import { keccak_256 } from "@noble/hashes/sha3";
import { bytesToHex } from "@noble/hashes/utils";

const ETH_ADDRESS_REGEX = /^0x[0-9a-fA-F]{40}$/;

export const INVALID_ADDRESS_ERROR =
  "Please enter a valid Ethereum address (0x followed by 40 hex characters).";

export const INVALID_WALLET_CHECKSUM_ERROR =
  "Wallet address failed EIP-55 checksum validation.";

export const INVALID_WALLET_CHECKSUM = "INVALID_WALLET_CHECKSUM";

export type ValidateAddressResult =
  | { valid: true; address: string }
  | { valid: false; error: string; code?: typeof INVALID_WALLET_CHECKSUM };

export class WalletAddressError extends Error {
  readonly code: string;

  constructor(message: string, code: string) {
    super(message);
    this.name = "WalletAddressError";
    this.code = code;
  }
}

/** True when the address body is mixed-case (carries an EIP-55 checksum). */
export function isMixedCaseAddress(address: string): boolean {
  const body = address.startsWith("0x") || address.startsWith("0X") ? address.slice(2) : address;
  return body !== body.toLowerCase() && body !== body.toUpperCase();
}

/** Verify EIP-55 checksum for a mixed-case `0x` + 40-hex address. */
export function hasValidEip55Checksum(address: string): boolean {
  if (!ETH_ADDRESS_REGEX.test(address)) return false;
  const body = address.slice(2);
  if (body === body.toLowerCase() || body === body.toUpperCase()) return true;

  const hash = bytesToHex(keccak_256(new TextEncoder().encode(body.toLowerCase())));
  for (let i = 0; i < 40; i++) {
    const ch = body[i];
    if (ch >= "0" && ch <= "9") continue;
    const hashNibble = parseInt(hash[i], 16);
    if (hashNibble >= 8) {
      if (ch !== ch.toUpperCase()) return false;
    } else if (ch !== ch.toLowerCase()) {
      return false;
    }
  }
  return true;
}

export function validateAndNormalizeAddress(
  address: string | null | undefined,
): ValidateAddressResult {
  if (!address || !ETH_ADDRESS_REGEX.test(address)) {
    return { valid: false, error: INVALID_ADDRESS_ERROR };
  }

  if (isMixedCaseAddress(address) && !hasValidEip55Checksum(address)) {
    return {
      valid: false,
      error: INVALID_WALLET_CHECKSUM_ERROR,
      code: INVALID_WALLET_CHECKSUM,
    };
  }

  return { valid: true, address: address.toLowerCase() };
}

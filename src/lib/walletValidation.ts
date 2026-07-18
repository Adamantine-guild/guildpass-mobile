/**
 * Validates and normalises an Ethereum wallet address.
 *
 * A valid address must match `/^0x[0-9a-fA-F]{40}$/`.
 * On success the address is returned in lowercase form.
 * On failure a human-readable error message is returned.
 */

const ETH_ADDRESS_REGEX = /^0x[0-9a-fA-F]{40}$/;

const INVALID_ADDRESS_ERROR =
  "Please enter a valid Ethereum address (0x followed by 40 hex characters).";

export type ValidateAddressResult =
  | { valid: true; address: string }
  | { valid: false; error: string };

export function validateAndNormalizeAddress(
  address: string | null | undefined
): ValidateAddressResult {
  if (!address || !ETH_ADDRESS_REGEX.test(address)) {
    return { valid: false, error: INVALID_ADDRESS_ERROR };
  }

  return { valid: true, address: address.toLowerCase() };
}

export function areWalletAddressesEqual(
  left: string | null | undefined,
  right: string | null | undefined,
): boolean {
  const leftValidation = validateAndNormalizeAddress(left);
  const rightValidation = validateAndNormalizeAddress(right);

  return leftValidation.valid && rightValidation.valid && leftValidation.address === rightValidation.address;
}

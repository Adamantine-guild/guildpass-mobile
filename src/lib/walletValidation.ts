/**
 * Validates and normalises an Ethereum wallet address.
 *
 * A valid address must match `/^0x[0-9a-fA-F]{40}$/`.
 * On success the address is returned in lowercase form.
 * On failure a human-readable error message is returned.
 */

const ETH_ADDRESS_REGEX = /^0x[0-9a-fA-F]{40}$/;
const HEX_CHARS_REGEX = /^[0-9a-fA-F]+$/;

const INVALID_ADDRESS_ERROR =
  "Please enter a valid Ethereum address (0x followed by 40 hex characters).";

export type ValidateAddressResult =
  { valid: true; address: string } | { valid: false; error: string };

export function validateAndNormalizeAddress(
  address: string | null | undefined,
): ValidateAddressResult {
  if (!address || !ETH_ADDRESS_REGEX.test(address)) {
    return { valid: false, error: INVALID_ADDRESS_ERROR };
  }

  return { valid: true, address: address.toLowerCase() };
}

/**
 * Field-level validation for manual wallet address input.
 * Provides specific, actionable error messages for real-time feedback.
 * Returns `null` error for empty or valid input so the UI can
 * decide whether to surface the message based on touch state.
 */
export function validateAddressInput(address: string): { valid: boolean; error: string | null } {
  const trimmed = address.trim();

  // Empty — no error until the user blurs or submits
  if (!trimmed) {
    return { valid: false, error: null };
  }

  // Must start with 0x
  if (!trimmed.startsWith("0x") && !trimmed.startsWith("0X")) {
    return { valid: false, error: "Must start with 0x" };
  }

  // After stripping 0x prefix, check length
  const afterPrefix = trimmed.slice(2);

  if (afterPrefix.length !== 40) {
    return {
      valid: false,
      error: `Must be 42 characters (0x + 40 hex characters) — currently ${trimmed.length}`,
    };
  }

  // Correct length but non-hex characters
  if (!HEX_CHARS_REGEX.test(afterPrefix)) {
    return {
      valid: false,
      error: "Must only contain hex characters (0-9, a-f)",
    };
  }

  return { valid: true, error: null };
}

export function areWalletAddressesEqual(
  left: string | null | undefined,
  right: string | null | undefined,
): boolean {
  const leftValidation = validateAndNormalizeAddress(left);
  const rightValidation = validateAndNormalizeAddress(right);

  return (
    leftValidation.valid &&
    rightValidation.valid &&
    leftValidation.address === rightValidation.address
  );
}

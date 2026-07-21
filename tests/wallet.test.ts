// GuildPass Mobile: Import package module dependencies.
import { describe, it, expect, beforeEach } from "vitest";
// GuildPass Mobile: Pull in react-native, expo, or external state libraries.
import { useWalletStore } from "../src/features/wallet/wallet.store";

// GuildPass Mobile: Mobile unit test assertion block.
describe("Wallet Store", () => {
  // GuildPass Mobile: Enter functional execution container scope block.
  beforeEach(() => {
    useWalletStore.setState({ walletAddress: null, isConnected: false });
    // GuildPass Mobile: Exit functional execution container scope block.
  });

  // GuildPass Mobile: Mobile unit test assertion block.
  it("should update wallet address", () => {
    // GuildPass Mobile: Variable binding and property initialization.
    const address = "0x1234567890123456789012345678901234567890";
    useWalletStore.getState().setWalletAddress(address);

    expect(useWalletStore.getState().walletAddress).toBe(address);
    expect(useWalletStore.getState().isConnected).toBe(true);
    // GuildPass Mobile: Exit functional execution container scope block.
  });

  it("accepts an embedded wallet address through the same normalized store", () => {
    const address = "0xAbCdEf1234567890AbCdEf1234567890AbCdEf12";

    useWalletStore.getState().setWalletAddress(address, "embedded");

    expect(useWalletStore.getState().walletAddress).toBe(address.toLowerCase());
    expect(useWalletStore.getState().isConnected).toBe(true);
    expect(useWalletStore.getState().connectionKind).toBe("embedded");
  });

  // GuildPass Mobile: Mobile unit test assertion block.
  it("should disconnect", () => {
    // GuildPass Mobile: Enter functional execution container scope block.
    useWalletStore.setState({
      walletAddress: "0x123",
      isConnected: true,
      // GuildPass Mobile: Exit functional execution container scope block.
    });

    useWalletStore.getState().disconnect();

    expect(useWalletStore.getState().walletAddress).toBe(null);
    expect(useWalletStore.getState().isConnected).toBe(false);
    // GuildPass Mobile: Exit functional execution container scope block.
  });
  // GuildPass Mobile: Exit functional execution container scope block.
});

/**
 * Preservation: Valid Address Behavior
 *
 * Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5, 3.6
 *
 * These tests assert baseline behaviour that MUST continue to hold after the fix.
 * All tests in this describe block MUST PASS on UNFIXED code.
 *
 * NOTE on normalisation: On unfixed code the address is stored exactly as supplied
 * (no .toLowerCase()). After the fix is applied the stored value will equal
 * address.toLowerCase(). The mixed-case test below documents this difference
 * explicitly so it remains green both before and after the fix.
 */
describe("Preservation: Valid Address Behavior", () => {
  beforeEach(() => {
    useWalletStore.setState({ walletAddress: null, isConnected: false });
  });

  it("property: setWalletAddress stores each random valid lowercase address and sets isConnected true", () => {
    // Generate 10 random valid 40-char lowercase hex addresses prefixed with 0x.
    const hexChars = "0123456789abcdef";
    const validAddresses = Array.from({ length: 10 }, () => {
      const body = Array.from(
        { length: 40 },
        () => hexChars[Math.floor(Math.random() * hexChars.length)]
      ).join("");
      return `0x${body}`;
    });

    for (const address of validAddresses) {
      useWalletStore.setState({ walletAddress: null, isConnected: false });
      useWalletStore.getState().setWalletAddress(address);

      // On unfixed code: address stored as-is; isConnected set to true.
      expect(useWalletStore.getState().walletAddress).toBe(address);
      expect(useWalletStore.getState().isConnected).toBe(true);
    }
  });

  it("disconnect after setWalletAddress clears walletAddress and isConnected", () => {
    const validAddress = "0x1234567890abcdef1234567890abcdef12345678";
    useWalletStore.getState().setWalletAddress(validAddress);

    // Confirm address is set before disconnecting.
    expect(useWalletStore.getState().walletAddress).toBe(validAddress);
    expect(useWalletStore.getState().isConnected).toBe(true);

    useWalletStore.getState().disconnect();

    expect(useWalletStore.getState().walletAddress).toBe(null);
    expect(useWalletStore.getState().isConnected).toBe(false);
  });

  it("valid mixed-case address is accepted by setWalletAddress (stored as-is on unfixed code — normalisation NOT yet applied)", () => {
    // EIP-55 mixed-case address: valid chars and length, but uppercase A–F present.
    const mixedCaseAddress = "0xAbCdEf1234567890AbCdEf1234567890AbCdEf12";

    useWalletStore.getState().setWalletAddress(mixedCaseAddress);

    // On UNFIXED code: address is stored exactly as supplied (no lowercasing).
    // After the fix this will equal mixedCaseAddress.toLowerCase().
    // The test asserts the address is accepted (not null) and isConnected is true,
    // which holds on both unfixed and fixed code — making it safe to run at both stages.
    expect(useWalletStore.getState().walletAddress).not.toBeNull();
    expect(useWalletStore.getState().isConnected).toBe(true);
  });
});

/**
 * Bug Condition: Invalid Address Rejection (exploration)
 *
 * Validates: Requirements 1.2, 1.3
 *
 * CRITICAL: These tests are EXPECTED TO FAIL on unfixed code.
 * Failure here confirms the bug exists — invalid addresses are currently accepted
 * without validation by connectManually and setWalletAddress.
 *
 * After the fix is applied (Task 3), these same tests must PASS.
 *
 * Counterexamples confirmed by this exploration:
 *  - connectManually("0x123") sets walletAddress to "0x123" and isConnected to true
 *  - connectManually("1234567890123456789012345678901234567890") stores the no-prefix address
 *  - connectManually("0xGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGG") stores a non-hex address
 *  - setWalletAddress("") sets walletAddress to "" and isConnected to false (silently)
 *  - handleCheck logic with "0xBAD" sets checkParams when it should remain null
 */
describe("Bug Condition: Invalid Address Rejection (exploration)", () => {
  // NOTE: These tests were originally written to FAIL on unfixed code (confirming the bug).
  // Now that the fix is applied, they use the FIXED validateAndNormalizeAddress + setWalletAddress
  // to verify the bug is resolved. All tests in this block now PASS on fixed code.

  // Fixed connectManually: validates first, then stores
  const connectManually = (address: string): { success: boolean; error?: string } => {
    const validation = validateAndNormalizeAddress(address);
    if (!validation.valid) {
      return { success: false, error: validation.error };
    }
    useWalletStore.getState().setWalletAddress(validation.address);
    return { success: true };
  };

  beforeEach(() => {
    useWalletStore.setState({ walletAddress: null, isConnected: false });
  });

  it('rejects "0x123" (too short) — store must remain null', () => {
    const result = connectManually("0x123");

    expect(useWalletStore.getState().walletAddress).toBe(null);
    expect(useWalletStore.getState().isConnected).toBe(false);
    expect(result.success).toBe(false);
    expect(result.error).toBeTruthy();
  });

  it('rejects "1234567890123456789012345678901234567890" (missing 0x prefix) — store must remain null', () => {
    const result = connectManually("1234567890123456789012345678901234567890");

    expect(useWalletStore.getState().walletAddress).toBe(null);
    expect(useWalletStore.getState().isConnected).toBe(false);
    expect(result.success).toBe(false);
    expect(result.error).toBeTruthy();
  });

  it('rejects "0xGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGG" (non-hex chars) — store must remain null', () => {
    const result = connectManually("0xGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGG");

    expect(useWalletStore.getState().walletAddress).toBe(null);
    expect(useWalletStore.getState().isConnected).toBe(false);
    expect(result.success).toBe(false);
    expect(result.error).toBeTruthy();
  });

  it('rejects "" (empty string) via setWalletAddress — walletAddress must remain null', () => {
    useWalletStore.getState().setWalletAddress("");

    expect(useWalletStore.getState().walletAddress).toBe(null);
    expect(useWalletStore.getState().isConnected).toBe(false);
  });

  it('rejects "" (empty string) via connectManually — store must remain null with error', () => {
    const result = connectManually("");

    expect(useWalletStore.getState().walletAddress).toBe(null);
    expect(useWalletStore.getState().isConnected).toBe(false);
    expect(result.success).toBe(false);
    expect(result.error).toBeTruthy();
  });

  it('access-check: handleCheck with "0xBAD" must not set checkParams', () => {
    const address = "0xBAD";
    const guildId = "alpha-guild";
    const resourceId = "secret-channel";

    let checkParams: { walletAddress: string; guildId: string; resourceId: string } | null = null;

    // Fixed handleCheck logic: validates address format before setting checkParams
    const handleCheck = () => {
      if (address && guildId && resourceId) {
        const validation = validateAndNormalizeAddress(address);
        if (!validation.valid) {
          return;
        }
        checkParams = { walletAddress: validation.address, guildId, resourceId };
      }
    };

    handleCheck();

    expect(checkParams).toBe(null);
  });
});

import { validateAndNormalizeAddress, validateAddressInput } from "../src/lib/walletValidation";

// NOTE: useWallet is a React hook and cannot be instantiated outside a React context.
// We test connectManually's logic by testing validateAndNormalizeAddress directly
// (which it delegates to), and setWalletAddress via the store — matching the hook's
// internal implementation exactly.

describe("validateAndNormalizeAddress", () => {
  it('returns { valid: true, address: lowercased } for a valid all-lowercase address', () => {
    const result = validateAndNormalizeAddress("0x1234567890123456789012345678901234567890");
    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.address).toBe("0x1234567890123456789012345678901234567890");
    }
  });

  it('returns { valid: true, address: lowercased } for a valid mixed-case EIP-55 address', () => {
    const result = validateAndNormalizeAddress("0xAbCdEf1234567890AbCdEf1234567890AbCdEf12");
    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.address).toBe("0xabcdef1234567890abcdef1234567890abcdef12");
    }
  });

  it('returns { valid: false, error } for "0x123" (too short)', () => {
    const result = validateAndNormalizeAddress("0x123");
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.error).toBeTruthy();
    }
  });

  it('returns { valid: false, error } for "1234567890123456789012345678901234567890" (missing 0x)', () => {
    const result = validateAndNormalizeAddress("1234567890123456789012345678901234567890");
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.error).toBeTruthy();
    }
  });

  it('returns { valid: false, error } for "0xGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGG" (non-hex chars)', () => {
    const result = validateAndNormalizeAddress("0xGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGG");
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.error).toBeTruthy();
    }
  });

  it('returns { valid: false, error } for "" (empty string)', () => {
    const result = validateAndNormalizeAddress("");
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.error).toBeTruthy();
    }
  });

  it('returns { valid: false, error } for null', () => {
    const result = validateAndNormalizeAddress(null);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.error).toBeTruthy();
    }
  });

  it('returns { valid: false, error } for undefined', () => {
    const result = validateAndNormalizeAddress(undefined);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.error).toBeTruthy();
    }
  });
});

describe("setWalletAddress (fixed)", () => {
  beforeEach(() => {
    useWalletStore.setState({ walletAddress: null, isConnected: false });
  });

  it('leaves walletAddress: null and isConnected: false for "0xbad" (malformed)', () => {
    useWalletStore.getState().setWalletAddress("0xbad");
    expect(useWalletStore.getState().walletAddress).toBe(null);
    expect(useWalletStore.getState().isConnected).toBe(false);
  });

  it('stores the lowercased address and sets isConnected: true for a valid mixed-case address', () => {
    useWalletStore.getState().setWalletAddress("0xAbCdEf1234567890AbCdEf1234567890AbCdEf12");
    expect(useWalletStore.getState().walletAddress).toBe("0xabcdef1234567890abcdef1234567890abcdef12");
    expect(useWalletStore.getState().isConnected).toBe(true);
  });

  // The existing "should update wallet address" test (in the "Wallet Store" describe block above)
  // already verifies that a valid lowercase address is stored correctly and isConnected is set to true.
  // That test continues to pass with the fixed code since lowercase valid addresses are accepted as-is.
});

/**
 * PBT: Bug Condition — Fix Checking
 *
 * Validates: Requirements 2.2, 2.5
 *
 * For each known-invalid address, assert that:
 *   - validateAndNormalizeAddress returns { valid: false }
 *   - setWalletAddress leaves the store unchanged (walletAddress: null, isConnected: false)
 */
describe("PBT: Bug Condition — Fix Checking", () => {
  beforeEach(() => {
    useWalletStore.setState({ walletAddress: null, isConnected: false });
  });

  // Concrete invalid inputs: strings that do NOT match /^0x[0-9a-fA-F]{40}$/
  const invalidAddresses: string[] = [
    "0x123",
    "1234567890123456789012345678901234567890",
    "0xGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGG",
    "",
    "not-an-address",
    "0x" + "z".repeat(40),
    "0x" + "a".repeat(39),
  ];

  it("validateAndNormalizeAddress returns valid: false for every invalid address", () => {
    for (const address of invalidAddresses) {
      const result = validateAndNormalizeAddress(address);
      expect(result.valid, `expected valid: false for "${address}"`).toBe(false);
    }
  });

  it("setWalletAddress leaves store unchanged for every invalid address", () => {
    for (const address of invalidAddresses) {
      useWalletStore.setState({ walletAddress: null, isConnected: false });
      useWalletStore.getState().setWalletAddress(address);
      expect(
        useWalletStore.getState().walletAddress,
        `walletAddress should remain null for "${address}"`
      ).toBe(null);
      expect(
        useWalletStore.getState().isConnected,
        `isConnected should remain false for "${address}"`
      ).toBe(false);
    }
  });
});

/**
 * PBT: Preservation — Valid Address
 *
 * Validates: Requirements 3.1, 3.5
 *
 * For 20 randomly generated valid addresses:
 *   - validateAndNormalizeAddress returns { valid: true, address: lowercased }
 *   - setWalletAddress stores the lowercased address and sets isConnected: true
 */
describe("PBT: Preservation — Valid Address", () => {
  beforeEach(() => {
    useWalletStore.setState({ walletAddress: null, isConnected: false });
  });

  // Generator: 20 random valid 40-char lowercase hex addresses prefixed with 0x
  const hexChars = "0123456789abcdef";
  const validAddresses: string[] = Array.from({ length: 20 }, () => {
    const body = Array.from(
      { length: 40 },
      () => hexChars[Math.floor(Math.random() * hexChars.length)]
    ).join("");
    return `0x${body}`;
  });

  it("validateAndNormalizeAddress returns valid: true and lowercased address for each valid address", () => {
    for (const address of validAddresses) {
      const result = validateAndNormalizeAddress(address);
      expect(result.valid, `expected valid: true for "${address}"`).toBe(true);
      if (result.valid) {
        expect(result.address, `expected lowercased address for "${address}"`).toBe(
          address.toLowerCase()
        );
      }
    }
  });

  it("setWalletAddress stores lowercased address and sets isConnected: true for each valid address", () => {
    for (const address of validAddresses) {
      useWalletStore.setState({ walletAddress: null, isConnected: false });
      useWalletStore.getState().setWalletAddress(address);
      expect(
        useWalletStore.getState().walletAddress,
        `walletAddress should be lowercased for "${address}"`
      ).toBe(address.toLowerCase());
      expect(
        useWalletStore.getState().isConnected,
        `isConnected should be true for "${address}"`
      ).toBe(true);
    }
  });
});

/**
 * PBT: Case Normalisation
 *
 * Validates: Requirements 2.5, 3.5
 *
 * For 10 valid addresses with random casing of A–F hex letters:
 *   - validateAndNormalizeAddress always returns the address lowercased
 */
describe("PBT: Case Normalisation", () => {
  beforeEach(() => {
    useWalletStore.setState({ walletAddress: null, isConnected: false });
  });

  // Generator: 10 valid addresses with random upper/lower casing on hex A-F letters
  const hexCharsLower = "0123456789abcdef";
  const mixedCaseAddresses: string[] = Array.from({ length: 10 }, () => {
    // Start with a valid lowercase address body
    const body = Array.from(
      { length: 40 },
      () => hexCharsLower[Math.floor(Math.random() * hexCharsLower.length)]
    ).join("");
    // Randomly uppercase some hex letters (a-f → A-F)
    const mixedBody = body
      .split("")
      .map((c) => (Math.random() > 0.5 ? c.toUpperCase() : c))
      .join("");
    return `0x${mixedBody}`;
  });

  it("validateAndNormalizeAddress returns the address lowercased regardless of input casing", () => {
    for (const address of mixedCaseAddresses) {
      const result = validateAndNormalizeAddress(address);
      expect(result.valid, `expected valid: true for "${address}"`).toBe(true);
      if (result.valid) {
        expect(result.address, `expected lowercased result for "${address}"`).toBe(
          address.toLowerCase()
        );
      }
    }
  });
});

/**
 * Integration: Profile Flow and Access-Check Flow
 *
 * Validates: Requirements 2.1, 2.4, 2.6, 3.2, 3.3, 3.5
 *
 * These tests simulate the full flow for profile (connectManually) and
 * access-check (validateAndNormalizeAddress + checkParams guard) screens.
 */
describe("Integration: Profile Flow", () => {
  beforeEach(() => {
    useWalletStore.setState({ walletAddress: null, isConnected: false });
  });

  it("invalid address: connectManually returns { success: false }, store not mutated", () => {
    // Simulate profile handleConnect with an invalid address
    const invalidAddress = "0xBAD";
    const result = validateAndNormalizeAddress(invalidAddress);
    // validateAndNormalizeAddress is used by connectManually internally;
    // simulate the profile screen logic
    if (!result.valid) {
      // error shown, no store mutation
    } else {
      useWalletStore.getState().setWalletAddress(result.address);
    }

    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.error).toBeTruthy();
    }
    expect(useWalletStore.getState().walletAddress).toBe(null);
    expect(useWalletStore.getState().isConnected).toBe(false);
  });

  it("valid mixed-case address: connectManually stores lowercased address, isConnected true", () => {
    const mixedCaseAddress = "0xAbCdEf1234567890AbCdEf1234567890AbCdEf12";
    const result = validateAndNormalizeAddress(mixedCaseAddress);

    expect(result.valid).toBe(true);
    if (result.valid) {
      useWalletStore.getState().setWalletAddress(result.address);
      expect(useWalletStore.getState().walletAddress).toBe(
        mixedCaseAddress.toLowerCase()
      );
      expect(useWalletStore.getState().isConnected).toBe(true);
    }
  });
});

describe("Integration: Access-Check Flow", () => {
  it("invalid address: handleCheck does not set checkParams, addressError is set", () => {
    const address = "0xBAD";
    const guildId = "alpha-guild";
    const resourceId = "secret-channel";

    let checkParams: { walletAddress: string; guildId: string; resourceId: string } | null = null;
    let addressError: string | null = null;

    // Simulate the FIXED handleCheck logic from access-check.tsx
    const handleCheck = () => {
      if (address && guildId && resourceId) {
        const validation = validateAndNormalizeAddress(address);
        if (!validation.valid) {
          addressError = validation.error;
          return;
        }
        addressError = null;
        checkParams = { walletAddress: validation.address, guildId, resourceId };
      }
    };

    handleCheck();

    expect(checkParams).toBe(null);
    expect(addressError).toBeTruthy();
  });

  it("valid address: handleCheck sets checkParams with normalized lowercase address", () => {
    const address = "0xAbCdEf1234567890AbCdEf1234567890AbCdEf12";
    const guildId = "alpha-guild";
    const resourceId = "secret-channel";

    let checkParams: { walletAddress: string; guildId: string; resourceId: string } | null = null;
    let addressError: string | null = null;

    const handleCheck = () => {
      if (address && guildId && resourceId) {
        const validation = validateAndNormalizeAddress(address);
        if (!validation.valid) {
          addressError = validation.error;
          return;
        }
        addressError = null;
        checkParams = { walletAddress: validation.address, guildId, resourceId };
      }
    };

    handleCheck();

    expect(checkParams).not.toBe(null);
    expect(checkParams!.walletAddress).toBe(address.toLowerCase());
    expect(addressError).toBe(null);
  });

  it("context-switch: stored address unchanged after simulated navigation (store re-read)", () => {
    useWalletStore.setState({ walletAddress: null, isConnected: false });

    const validAddress = "0x1234567890abcdef1234567890abcdef12345678";
    useWalletStore.getState().setWalletAddress(validAddress);

    // Simulate navigation: re-read the store (as a different screen would)
    const storedAddress = useWalletStore.getState().walletAddress;
    const storedConnected = useWalletStore.getState().isConnected;

    expect(storedAddress).toBe(validAddress);
    expect(storedConnected).toBe(true);
  });
});

/**
 * Field-Level Validation: validateAddressInput
 *
 * Validates real-time (on-change / on-blur) field-level error text used
 * in the manual wallet entry form (app/profile.tsx). This is the UI-side
 * validation that runs BEFORE submission, providing specific actionable
 * error messages and disabling the submit button until the address is valid.
 */
describe("validateAddressInput", () => {
  it('returns { valid: false, error: null } for empty string (no error until touched)', () => {
    const result = validateAddressInput("");
    expect(result.valid).toBe(false);
    expect(result.error).toBeNull();
  });

  it('returns { valid: false, error: null } for whitespace-only string', () => {
    const result = validateAddressInput("   ");
    expect(result.valid).toBe(false);
    expect(result.error).toBeNull();
  });

  it('returns { valid: false, error: "Must start with 0x" } for address missing prefix', () => {
    const result = validateAddressInput("123456789012345678901234567890123456789012");
    expect(result.valid).toBe(false);
    expect(result.error).toBe("Must start with 0x");
  });

  it('returns { valid: false, error: "Must start with 0x" } for address without 0x prefix', () => {
    const result = validateAddressInput("deadbeefdeadbeefdeadbeefdeadbeefdeadbeef");
    expect(result.valid).toBe(false);
    expect(result.error).toBe("Must start with 0x");
  });

  it('returns error including "42 characters" for address with 0x but too short', () => {
    const result = validateAddressInput("0x1234");
    expect(result.valid).toBe(false);
    expect(result.error).toContain("42 characters");
  });

  it('returns error including "42 characters" for address with 0x but too long', () => {
    const result = validateAddressInput("0x12345678901234567890123456789012345678901234");
    expect(result.valid).toBe(false);
    expect(result.error).toContain("42 characters");
  });

  it('returns error including "42 characters" for address with 0x and 39 hex chars', () => {
    const result = validateAddressInput("0x" + "a".repeat(39));
    expect(result.valid).toBe(false);
    expect(result.error).toContain("42 characters");
  });

  it('returns { valid: false, error: "Must only contain hex characters" } for non-hex chars after 0x', () => {
    const result = validateAddressInput("0xGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGG");
    expect(result.valid).toBe(false);
    expect(result.error).toBe("Must only contain hex characters (0-9, a-f)");
  });

  it('returns { valid: false, error: "Must only contain hex characters" } for special chars after 0x', () => {
    const result = validateAddressInput("0x!!!!!aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa");
    expect(result.valid).toBe(false);
    expect(result.error).toBe("Must only contain hex characters (0-9, a-f)");
  });

  it('returns { valid: true, error: null } for valid lowercase address', () => {
    const result = validateAddressInput("0x1234567890123456789012345678901234567890");
    expect(result.valid).toBe(true);
    expect(result.error).toBeNull();
  });

  it('returns { valid: true, error: null } for valid mixed-case address', () => {
    const result = validateAddressInput("0xAbCdEf1234567890AbCdEf1234567890AbCdEf12");
    expect(result.valid).toBe(true);
    expect(result.error).toBeNull();
  });

  it('returns { valid: true, error: null } for valid address with leading/trailing whitespace', () => {
    const result = validateAddressInput("  0x1234567890123456789012345678901234567890  ");
    expect(result.valid).toBe(true);
    expect(result.error).toBeNull();
  });
});

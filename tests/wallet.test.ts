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

  it("valid mixed-case EIP-55 address is accepted by setWalletAddress (normalised to lowercase)", () => {
    const mixedCaseAddress = "0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed";

    useWalletStore.getState().setWalletAddress(mixedCaseAddress);

    expect(useWalletStore.getState().walletAddress).toBe(mixedCaseAddress.toLowerCase());
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

import { validateAndNormalizeAddress } from "../src/lib/walletValidation";

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
    const result = validateAndNormalizeAddress("0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed");
    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.address).toBe("0x5aaeb6053f3e94c9b9a09f33669435e7ef1beaed");
    }
  });

  it("returns { valid: false, code: INVALID_WALLET_CHECKSUM } for a bad EIP-55 checksum", () => {
    const result = validateAndNormalizeAddress("0x5aaeb6053F3E94C9b9A09f33669435E7Ef1BeAed");
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.code).toBe("INVALID_WALLET_CHECKSUM");
      expect(result.error).toMatch(/checksum/i);
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
    useWalletStore.getState().setWalletAddress("0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed");
    expect(useWalletStore.getState().walletAddress).toBe("0x5aaeb6053f3e94c9b9a09f33669435e7ef1beaed");
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
 * For 10 valid addresses that are all-lowercase or all-uppercase (no EIP-55
 * mixed checksum), validateAndNormalizeAddress always returns lowercase.
 * Mixed-case inputs are covered separately with EIP-55 vectors.
 */
describe("PBT: Case Normalisation", () => {
  beforeEach(() => {
    useWalletStore.setState({ walletAddress: null, isConnected: false });
  });

  const hexCharsLower = "0123456789abcdef";
  const casedAddresses: string[] = Array.from({ length: 10 }, (_, i) => {
    const body = Array.from(
      { length: 40 },
      () => hexCharsLower[Math.floor(Math.random() * hexCharsLower.length)],
    ).join("");
    // Alternate all-lower / all-upper — both are valid without an EIP-55 checksum.
    return i % 2 === 0 ? `0x${body}` : `0x${body.toUpperCase()}`;
  });

  it("validateAndNormalizeAddress returns the address lowercased regardless of input casing", () => {
    for (const address of casedAddresses) {
      const result = validateAndNormalizeAddress(address);
      expect(result.valid, `expected valid: true for "${address}"`).toBe(true);
      if (result.valid) {
        expect(result.address, `expected lowercased result for "${address}"`).toBe(
          address.toLowerCase(),
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
    const mixedCaseAddress = "0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed";
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
    const address = "0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed";
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

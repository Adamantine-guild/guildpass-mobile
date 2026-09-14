import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { getAddress } from "viem";
import { QrSignatureError, QR_SIGNATURE_ERROR_CODES } from "../src/features/access/qrSignature";
import {
  QrPayloadError,
  QrPayloadErrorCode,
  QR_PAYLOAD_ERROR_CODES,
} from "../src/features/access/qrPayload";
import {
  clearIssuerKeyCache,
  resetKeyRegistryTimeouts,
  setKeyRegistryCacheTtlMs,
  setKeyRegistryOfflineTrustWindowMs,
} from "../src/features/access/guildIssuerKey";
import { clearNonceCache } from "../src/features/access/qrReplayGuard";
import { verifyAndParseAccessQrPayload } from "../src/features/access/verifyQrPayload";
import { GUILD_CONFIG_FIXTURE } from "./fixtures/guild.fixtures";
import {
  buildSignedQrPayloadString,
  TEST_ISSUER_PRIVATE_KEY,
  TEST_ISSUER_PUBLIC_KEY,
  TEST_ISSUER_PRIVATE_KEY_V2,
  TEST_ISSUER_PUBLIC_KEY_V2,
  TEST_REVOKED_PRIVATE_KEY,
  TEST_REVOKED_PUBLIC_KEY,
  type QrPayloadFields,
} from "./fixtures/qrSignature.fixtures";

/**
 * End-to-end adversarial test harness for the QR access pipeline.
 *
 * Drives `verifyAndParseAccessQrPayload` (the single top-level entry point)
 * against the real parsing, key-resolution, signature and replay modules —
 * only the SDK network boundary is mocked. Each scenario asserts the exact
 * error code produced by the composed pipeline, not merely "some error".
 *
 * The suite also proves there is no false-positive "rejection bleed" between
 * scans: shared module state (in-memory nonce cache, key registry cache) is
 * reset between cases, and every rejection is followed by an acceptance probe
 * of an unrelated, still-valid payload.
 */

// hoisted values survive vi.mock hoisting and can be referenced by factories.
const { mockGetGuildConfig } = vi.hoisted(() => ({ mockGetGuildConfig: vi.fn() }));
const flagState = vi.hoisted(() => ({ qrSignatureVerification: true }));

// Only the network boundary is mocked. Everything else in the pipeline
// (parse -> key lookup -> signature verify -> replay guard) is the real code.
vi.mock("../src/lib/guildpassClient", () => ({
  guildPassClient: {
    guilds: { getGuildConfig: mockGetGuildConfig },
  },
}));

vi.mock("../src/config/appConfig", () => ({
  appConfig: flagState,
}));

// ---------------------------------------------------------------------------
// Shared fixtures & helpers
// ---------------------------------------------------------------------------

const NOW = new Date("2026-06-23T12:00:00.000Z");
const VALID_EXPIRES_AT = "2026-06-23T12:05:00.000Z";
const FAR_FUTURE_EXPIRES_AT = "2026-06-23T13:00:00.000Z";
const PAST_EXPIRES_AT = "2026-06-23T11:59:59.000Z";
const WALLET_ADDRESS = "0x1234567890123456789012345678901234567890";

const baseFields: QrPayloadFields = {
  guildId: "guild_abc",
  resourceId: "vip-door",
  walletAddress: WALLET_ADDRESS,
  expiresAt: VALID_EXPIRES_AT,
  kid: "key-1",
};

// A valid EIP-55 checksummed address plus a same-letter, wrong-casing variant
// that the strict checksum check must reject.
const CHECKSUMMED_WALLET = getAddress("0x5aeda56215b167893e80b4fe645ba6d5bab767de");
// Same hex characters with one letter's casing flipped (still eth-pattern-valid,
// but no longer EIP-55 checksum-correct).
const WRONG_CASE_WALLET = `0x${CHECKSUMMED_WALLET.slice(2).replace(/[A-Za-z]/, (character) =>
  character === character.toUpperCase() ? character.toLowerCase() : character.toUpperCase(),
)}`;

/** Build a fully-signed, structurally-valid payload string. */
const validPayloadString = (
  overrides: Partial<QrPayloadFields> = {},
  privateKey: string = TEST_ISSUER_PRIVATE_KEY,
  nonce?: string,
): string => {
  const raw = buildSignedQrPayloadString({ ...baseFields, ...overrides }, privateKey);
  if (nonce === undefined) return raw;
  const parsed = JSON.parse(raw) as Record<string, unknown>;
  return JSON.stringify({ ...parsed, nonce });
};

/** Parse + mutate + re-stringify a payload, preserving its (possibly stale) signature. */
const mutatePayload = (raw: string, mutate: (payload: Record<string, unknown>) => void): string => {
  const payload = JSON.parse(raw) as Record<string, unknown>;
  mutate(payload);
  return JSON.stringify(payload);
};

/** Flip a nibble in a hex string so it stays valid hex but changes value. */
const flipHexNibble = (hex: string): string => {
  const index = Math.floor(hex.length / 2);
  const character = hex[index];
  const flipped = ((parseInt(character, 16) + 5) % 16).toString(16);
  return hex.slice(0, index) + flipped + hex.slice(index + 1);
};

/** Assert a full-pipeline rejection with the exact error code. */
const expectRejection = async (raw: string, code: string, now: Date = NOW): Promise<void> => {
  await expect(verifyAndParseAccessQrPayload(raw, now)).rejects.toMatchObject({ code });
};

/** Scan a fresh, unrelated, still-valid payload to prove no rejection bleed. */
const expectControlAccepted = async (
  overrides: Partial<QrPayloadFields> = {},
  privateKey: string = TEST_ISSUER_PRIVATE_KEY,
): Promise<void> => {
  const result = await verifyAndParseAccessQrPayload(
    validPayloadString(overrides, privateKey),
    NOW,
  );
  expect(result.isVerified).toBe(true);
  expect(result.payload.guildId).toBe(overrides.guildId ?? "guild_abc");
};

// ---------------------------------------------------------------------------
// Test lifecycle: reset every piece of shared module state between cases.
// ---------------------------------------------------------------------------

beforeEach(() => {
  clearIssuerKeyCache();
  clearNonceCache();
  resetKeyRegistryTimeouts();
  mockGetGuildConfig.mockReset();
  mockGetGuildConfig.mockResolvedValue(GUILD_CONFIG_FIXTURE);
});

afterEach(() => {
  clearIssuerKeyCache();
  clearNonceCache();
  resetKeyRegistryTimeouts();
});

// ---------------------------------------------------------------------------
// Baseline acceptance (the control payload the matrix mutates from).
// ---------------------------------------------------------------------------

describe("baseline acceptance", () => {
  it("accepts a correctly-signed payload end-to-end", async () => {
    const result = await verifyAndParseAccessQrPayload(validPayloadString(), NOW);
    expect(result.isVerified).toBe(true);
    expect(result.payload).toMatchObject({
      guildId: "guild_abc",
      resourceId: "vip-door",
      walletAddress: WALLET_ADDRESS,
      expiresAt: VALID_EXPIRES_AT,
      kid: "key-1",
    });
  });

  it("accepts a valid payload carrying an EIP-55 checksummed wallet address", async () => {
    const result = await verifyAndParseAccessQrPayload(
      validPayloadString({ walletAddress: CHECKSUMMED_WALLET }),
      NOW,
    );
    expect(result.isVerified).toBe(true);
    expect(result.payload.walletAddress).toBe(CHECKSUMMED_WALLET);
  });

  it("accepts unrelated valid payloads scanned in sequence against a cached registry", async () => {
    const first = await verifyAndParseAccessQrPayload(validPayloadString(), NOW);
    expect(first.isVerified).toBe(true);

    const second = await verifyAndParseAccessQrPayload(
      validPayloadString({ resourceId: "member-lounge" }),
      NOW,
    );
    expect(second.isVerified).toBe(true);

    // The key registry must be served from cache on the second scan.
    expect(mockGetGuildConfig).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// Signature tampering & forgery.
// ---------------------------------------------------------------------------

describe("signature tampering & forgery", () => {
  it("rejects a payload whose signature byte was flipped → VERIFICATION_FAILED", async () => {
    const tampered = mutatePayload(validPayloadString(), (payload) => {
      payload.signature = flipHexNibble(String(payload.signature));
    });
    await expectRejection(tampered, QR_SIGNATURE_ERROR_CODES.VERIFICATION_FAILED);
    await expectControlAccepted();
  });

  it("rejects a payload whose field was mutated after signing → VERIFICATION_FAILED", async () => {
    const tampered = mutatePayload(validPayloadString(), (payload) => {
      payload.resourceId = "tampered-door";
    });
    await expectRejection(tampered, QR_SIGNATURE_ERROR_CODES.VERIFICATION_FAILED);
    await expectControlAccepted();
  });

  it("rejects a payload signed with a different (wrong) issuer key → VERIFICATION_FAILED", async () => {
    const forged = validPayloadString({}, TEST_ISSUER_PRIVATE_KEY_V2);
    await expectRejection(forged, QR_SIGNATURE_ERROR_CODES.VERIFICATION_FAILED);
    await expectControlAccepted();
  });

  it("rejects a non-hex signature field → INVALID_SIGNATURE_FORMAT", async () => {
    const malformed = mutatePayload(validPayloadString(), (payload) => {
      payload.signature = "not-hex!!!";
    });
    await expectRejection(malformed, QR_SIGNATURE_ERROR_CODES.INVALID_SIGNATURE_FORMAT);
    await expectControlAccepted();
  });

  it("rejects a hex signature that is not a valid DER signature → VERIFICATION_FAILED", async () => {
    const garbage = mutatePayload(validPayloadString(), (payload) => {
      payload.signature = "deadbeef";
    });
    await expectRejection(garbage, QR_SIGNATURE_ERROR_CODES.VERIFICATION_FAILED);
    await expectControlAccepted();
  });

  it("rejects a payload with no signature at the structural layer → QR_PAYLOAD_INVALID_SIGNATURE", async () => {
    const unsigned = mutatePayload(validPayloadString(), (payload) => {
      delete payload.signature;
    });
    await expect(verifyAndParseAccessQrPayload(unsigned, NOW)).rejects.toBeInstanceOf(
      QrPayloadError,
    );
    await expectRejection(unsigned, QR_PAYLOAD_ERROR_CODES.INVALID_SIGNATURE);
    await expectControlAccepted();
  });
});

// ---------------------------------------------------------------------------
// Cross-guild replay.
// ---------------------------------------------------------------------------

describe("cross-guild replay", () => {
  it("rejects a valid guild_abc payload replayed against another guild that publishes the same kid under a different key → VERIFICATION_FAILED", async () => {
    mockGetGuildConfig.mockImplementation(async ({ guildId }: { guildId: string }) =>
      guildId === "guild_xyz"
        ? { guildId: "guild_xyz", issuerKeys: { "key-1": TEST_ISSUER_PUBLIC_KEY_V2 } }
        : GUILD_CONFIG_FIXTURE,
    );

    const replayed = mutatePayload(validPayloadString(), (payload) => {
      payload.guildId = "guild_xyz";
    });
    await expectRejection(replayed, QR_SIGNATURE_ERROR_CODES.VERIFICATION_FAILED);
    await expectControlAccepted();
  });

  it("rejects a cross-guild replay when the target guild does not publish the kid → UNKNOWN_KEY", async () => {
    mockGetGuildConfig.mockImplementation(async ({ guildId }: { guildId: string }) =>
      guildId === "guild_xyz"
        ? { guildId: "guild_xyz", issuerKeys: { "key-other": TEST_ISSUER_PUBLIC_KEY_V2 } }
        : GUILD_CONFIG_FIXTURE,
    );

    const replayed = mutatePayload(validPayloadString(), (payload) => {
      payload.guildId = "guild_xyz";
    });
    await expectRejection(replayed, QR_SIGNATURE_ERROR_CODES.UNKNOWN_KEY);
    await expectControlAccepted();
  });
});

// ---------------------------------------------------------------------------
// Key resolution, revocation, and registry expiry.
// ---------------------------------------------------------------------------

describe("key resolution & revocation", () => {
  it("rejects a payload signed with a revoked kid → REVOKED_KEY", async () => {
    mockGetGuildConfig.mockResolvedValue({
      guildId: "guild_abc",
      issuerKeys: {
        "key-1": TEST_ISSUER_PUBLIC_KEY,
        "key-revoked-99": TEST_REVOKED_PUBLIC_KEY,
      },
      revokedKids: ["key-revoked-99"],
    });

    const revoked = validPayloadString({ kid: "key-revoked-99" }, TEST_REVOKED_PRIVATE_KEY);
    await expectRejection(revoked, QR_SIGNATURE_ERROR_CODES.REVOKED_KEY);
    await expectControlAccepted();
  });

  it("rejects a revoked kid even when the signature is also invalid (revocation precedes signature check) → REVOKED_KEY", async () => {
    mockGetGuildConfig.mockResolvedValue({
      guildId: "guild_abc",
      issuerKeys: {
        "key-1": TEST_ISSUER_PUBLIC_KEY,
        "key-2": TEST_ISSUER_PUBLIC_KEY_V2,
      },
      revokedKids: ["key-1"],
    });

    const tampered = mutatePayload(validPayloadString({ kid: "key-1" }), (payload) => {
      payload.signature = flipHexNibble(String(payload.signature));
    });
    await expectRejection(tampered, QR_SIGNATURE_ERROR_CODES.REVOKED_KEY);

    // Control: the still-active key-2 must remain accepted in the same run.
    await expectControlAccepted({ kid: "key-2" }, TEST_ISSUER_PRIVATE_KEY_V2);
  });

  it("rejects a payload bearing an unknown kid → UNKNOWN_KEY", async () => {
    mockGetGuildConfig.mockResolvedValue({
      guildId: "guild_abc",
      issuerKeys: { "key-v1": TEST_ISSUER_PUBLIC_KEY },
    });

    const unknown = validPayloadString({ kid: "key-9999" });
    await expectRejection(unknown, QR_SIGNATURE_ERROR_CODES.UNKNOWN_KEY);
    await expectControlAccepted({ kid: "key-v1" });
  });

  it("rejects with KEY_REGISTRY_EXPIRED when the registry is unrefreshable past the offline trust window", async () => {
    setKeyRegistryCacheTtlMs(60_000);
    setKeyRegistryOfflineTrustWindowMs(120_000);

    // Prime the in-memory/persisted registry with a successful scan.
    await verifyAndParseAccessQrPayload(validPayloadString(), NOW);

    // Past the offline trust window with the network failing: refresh impossible.
    const tPastTrust = new Date(NOW.getTime() + 120_000 + 60_000);
    mockGetGuildConfig.mockRejectedValueOnce(new Error("offline"));

    const payload = validPayloadString({ expiresAt: FAR_FUTURE_EXPIRES_AT });
    await expectRejection(payload, QR_SIGNATURE_ERROR_CODES.KEY_REGISTRY_EXPIRED, tPastTrust);

    // A normal scan at the prime time still works off the fresh cache.
    await expectControlAccepted();
  });
});

// ---------------------------------------------------------------------------
// Replay / nonce single-use enforcement.
// ---------------------------------------------------------------------------

describe("replay & nonce single-use enforcement", () => {
  it("rejects re-presenting the identical payload → ALREADY_USED", async () => {
    const raw = validPayloadString({}, TEST_ISSUER_PRIVATE_KEY, "replay-same-payload");

    await expect(verifyAndParseAccessQrPayload(raw, NOW)).resolves.toMatchObject({
      isVerified: true,
    });
    await expectRejection(raw, QR_PAYLOAD_ERROR_CODES.ALREADY_USED);
    await expectRejection(raw, QR_PAYLOAD_ERROR_CODES.ALREADY_USED);
  });

  it("rejects the same nonce reused on a different but otherwise-valid payload → ALREADY_USED", async () => {
    const first = validPayloadString(
      { resourceId: "vip-door" },
      TEST_ISSUER_PRIVATE_KEY,
      "shared-nonce",
    );
    const second = validPayloadString(
      { resourceId: "other-door" },
      TEST_ISSUER_PRIVATE_KEY,
      "shared-nonce",
    );

    await expect(verifyAndParseAccessQrPayload(first, NOW)).resolves.toMatchObject({
      isVerified: true,
    });
    await expectRejection(second, QR_PAYLOAD_ERROR_CODES.ALREADY_USED);
  });

  it("checks the signature before replay: tampered reuse of a used nonce → VERIFICATION_FAILED, not ALREADY_USED", async () => {
    const raw = validPayloadString({}, TEST_ISSUER_PRIVATE_KEY, "ordering-nonce");

    // First acceptance records the nonce...
    await expect(verifyAndParseAccessQrPayload(raw, NOW)).resolves.toMatchObject({
      isVerified: true,
    });
    // ...so a clean re-presentation is a replay.
    await expectRejection(raw, QR_PAYLOAD_ERROR_CODES.ALREADY_USED);

    // A tampered reuse of the SAME nonce fails signature verification first —
    // the ORDER of checks matters for what an attacker learns.
    const tampered = mutatePayload(raw, (payload) => {
      payload.resourceId = "tampered-door";
    });
    await expect(verifyAndParseAccessQrPayload(tampered, NOW)).rejects.toBeInstanceOf(
      QrSignatureError,
    );
    await expectRejection(tampered, QR_SIGNATURE_ERROR_CODES.VERIFICATION_FAILED);
  });

  it("does not record a nonce from a signature-rejected payload (no shared-cache poisoning)", async () => {
    const nonce = "no-poison-nonce";
    const clean = validPayloadString({}, TEST_ISSUER_PRIVATE_KEY, nonce);
    const tampered = mutatePayload(clean, (payload) => {
      payload.resourceId = "tampered-door";
    });

    await expectRejection(tampered, QR_SIGNATURE_ERROR_CODES.VERIFICATION_FAILED);

    // The same nonce on a valid payload must still be accepted.
    const result = await verifyAndParseAccessQrPayload(clean, NOW);
    expect(result.isVerified).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Stage ordering & cost: cheap checks must run before expensive ones.
// ---------------------------------------------------------------------------

describe("stage ordering & cost", () => {
  it("rejects an expired-but-otherwise-valid payload before any key registry fetch → EXPIRED", async () => {
    const expired = validPayloadString({ expiresAt: PAST_EXPIRES_AT });
    await expectRejection(expired, QR_PAYLOAD_ERROR_CODES.EXPIRED);
    expect(mockGetGuildConfig).not.toHaveBeenCalled();
  });

  it("rejects an expired payload carrying a revoked kid with EXPIRED, never reaching key lookup", async () => {
    mockGetGuildConfig.mockResolvedValue({
      guildId: "guild_abc",
      issuerKeys: { "key-1": TEST_ISSUER_PUBLIC_KEY },
      revokedKids: ["key-1"],
    });

    const expiredAndRevoked = validPayloadString({
      kid: "key-1",
      expiresAt: PAST_EXPIRES_AT,
    });
    await expectRejection(expiredAndRevoked, QR_PAYLOAD_ERROR_CODES.EXPIRED);
    expect(mockGetGuildConfig).not.toHaveBeenCalled();
  });

  it("rejects malformed JSON before any key registry fetch → MALFORMED_JSON", async () => {
    await expectRejection("{not-json", QR_PAYLOAD_ERROR_CODES.MALFORMED_JSON);
    expect(mockGetGuildConfig).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Structural / schema malformations, driven end-to-end.
// ---------------------------------------------------------------------------

type StructuralCase = {
  name: string;
  build: () => string;
  code: QrPayloadErrorCode;
};

const structuralCases: StructuralCase[] = [
  {
    name: "malformed JSON",
    build: () => "this is not json",
    code: QR_PAYLOAD_ERROR_CODES.MALFORMED_JSON,
  },
  {
    name: "valid JSON, wrong shape (array)",
    build: () => JSON.stringify(["a", "b"]),
    code: QR_PAYLOAD_ERROR_CODES.MALFORMED_PAYLOAD,
  },
  {
    name: "valid JSON, wrong shape (scalar)",
    build: () => JSON.stringify("hello"),
    code: QR_PAYLOAD_ERROR_CODES.MALFORMED_PAYLOAD,
  },
  {
    name: "unsupported payload type",
    build: () =>
      mutatePayload(validPayloadString(), (payload) => void (payload.type = "guildpass.event")),
    code: QR_PAYLOAD_ERROR_CODES.UNSUPPORTED_TYPE,
  },
  {
    name: "unsupported payload version",
    build: () => mutatePayload(validPayloadString(), (payload) => void (payload.version = 1)),
    code: QR_PAYLOAD_ERROR_CODES.UNSUPPORTED_VERSION,
  },
  {
    name: "missing guildId",
    build: () => mutatePayload(validPayloadString(), (payload) => void delete payload.guildId),
    code: QR_PAYLOAD_ERROR_CODES.MISSING_GUILD_ID,
  },
  {
    name: "guildId that is not a valid identifier",
    build: () =>
      mutatePayload(validPayloadString(), (payload) => void (payload.guildId = "bad id")),
    code: QR_PAYLOAD_ERROR_CODES.MISSING_GUILD_ID,
  },
  {
    name: "missing resourceId",
    build: () => mutatePayload(validPayloadString(), (payload) => void delete payload.resourceId),
    code: QR_PAYLOAD_ERROR_CODES.MISSING_RESOURCE_ID,
  },
  {
    name: "invalid wallet address",
    build: () =>
      mutatePayload(validPayloadString(), (payload) => void (payload.walletAddress = "0x1234")),
    code: QR_PAYLOAD_ERROR_CODES.INVALID_WALLET_ADDRESS,
  },
  {
    name: "wallet address with a wrong EIP-55 checksum casing",
    build: () =>
      mutatePayload(
        validPayloadString(),
        (payload) => void (payload.walletAddress = WRONG_CASE_WALLET),
      ),
    code: QR_PAYLOAD_ERROR_CODES.INVALID_WALLET_CHECKSUM,
  },
  {
    name: "unparseable expiration",
    build: () =>
      mutatePayload(validPayloadString(), (payload) => void (payload.expiresAt = "not-a-date")),
    code: QR_PAYLOAD_ERROR_CODES.INVALID_EXPIRATION,
  },
  {
    name: "expired payload",
    build: () => validPayloadString({ expiresAt: PAST_EXPIRES_AT }),
    code: QR_PAYLOAD_ERROR_CODES.EXPIRED,
  },
  {
    name: "empty kid",
    build: () => mutatePayload(validPayloadString(), (payload) => void (payload.kid = "")),
    code: QR_PAYLOAD_ERROR_CODES.INVALID_KID,
  },
  {
    name: "missing kid",
    build: () => mutatePayload(validPayloadString(), (payload) => void delete payload.kid),
    code: QR_PAYLOAD_ERROR_CODES.INVALID_KID,
  },
  {
    name: "missing signature",
    build: () => mutatePayload(validPayloadString(), (payload) => void delete payload.signature),
    code: QR_PAYLOAD_ERROR_CODES.INVALID_SIGNATURE,
  },
  {
    name: "empty signature",
    build: () => mutatePayload(validPayloadString(), (payload) => void (payload.signature = "")),
    code: QR_PAYLOAD_ERROR_CODES.INVALID_SIGNATURE,
  },
];

describe("structural / schema malformations (through the full pipeline)", () => {
  it.each(structuralCases)("rejects $name → $code", async ({ build, code }: StructuralCase) => {
    await expectRejection(build(), code);
    // No false-positive bleed: a valid payload scanned right after is accepted.
    await expectControlAccepted();
  });
});

// ---------------------------------------------------------------------------
// Composition regression: valid scans survive adversarial runs.
// ---------------------------------------------------------------------------

describe("composition regression", () => {
  it("accepts a valid payload between and after every adversarial rejection in the same run", async () => {
    const adversarial: { name: string; build: () => string; code: string }[] = [
      {
        name: "flipped signature byte",
        build: () =>
          mutatePayload(validPayloadString(), (payload) => {
            payload.signature = flipHexNibble(String(payload.signature));
          }),
        code: QR_SIGNATURE_ERROR_CODES.VERIFICATION_FAILED,
      },
      {
        name: "field tampered after signing",
        build: () =>
          mutatePayload(validPayloadString(), (payload) => {
            payload.resourceId = "tampered-door";
          }),
        code: QR_SIGNATURE_ERROR_CODES.VERIFICATION_FAILED,
      },
      {
        name: "expired payload",
        build: () => validPayloadString({ expiresAt: PAST_EXPIRES_AT }),
        code: QR_PAYLOAD_ERROR_CODES.EXPIRED,
      },
      {
        name: "malformed JSON",
        build: () => "{not-json",
        code: QR_PAYLOAD_ERROR_CODES.MALFORMED_JSON,
      },
      {
        name: "unknown kid",
        build: () => validPayloadString({ kid: "ghost-kid" }),
        code: QR_SIGNATURE_ERROR_CODES.UNKNOWN_KEY,
      },
    ];

    for (const { name, build, code } of adversarial) {
      await expectRejection(build(), code);
      const clean = await verifyAndParseAccessQrPayload(validPayloadString(), NOW);
      expect(clean.isVerified, `a valid scan must survive after: ${name}`).toBe(true);
    }
  });
});

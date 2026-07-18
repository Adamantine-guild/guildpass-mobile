/**
 * SIWE (EIP-4361) message build/parse — contract & behaviour tests.
 *
 * These functions are pure and deterministic, so the tests pin the exact wire
 * format (byte-for-byte) that the backend verifier depends on. A change to the
 * message layout must break these tests before it silently breaks sign-in.
 */

import { describe, it, expect } from "vitest";
import { buildSiweMessage, parseSiweMessage, SiweError } from "../src/features/auth/siwe";
import { SiweParams } from "../src/features/auth/siwe.types";

const ADDR = "0x1234567890123456789012345678901234567890";

const BASE: SiweParams = {
  domain: "app.guildpass.xyz",
  address: ADDR,
  statement: "Sign in to GuildPass",
  uri: "guildpass://login",
  version: "1",
  chainId: 1,
  nonce: "abc12345",
  issuedAt: "2024-01-15T10:30:00.000Z",
};

describe("buildSiweMessage", () => {
  it("produces the canonical EIP-4361 layout without expiration", () => {
    const msg = buildSiweMessage(BASE);
    expect(msg).toBe(
      [
        "app.guildpass.xyz wants you to sign in with your Ethereum account:",
        ADDR,
        "",
        "Sign in to GuildPass",
        "",
        "URI: guildpass://login",
        "Version: 1",
        "Chain ID: 1",
        "Nonce: abc12345",
        "Issued At: 2024-01-15T10:30:00.000Z",
      ].join("\n"),
    );
  });

  it("appends Expiration Time only when present", () => {
    const withExp = buildSiweMessage({ ...BASE, expirationTime: "2024-01-15T11:30:00.000Z" });
    expect(withExp.endsWith("Expiration Time: 2024-01-15T11:30:00.000Z")).toBe(true);
    expect(buildSiweMessage(BASE).includes("Expiration Time")).toBe(false);
  });

  it("includes the server nonce (replay protection lives in the signed bytes)", () => {
    expect(buildSiweMessage(BASE)).toContain("Nonce: abc12345");
  });

  it("is deterministic — same input yields identical output", () => {
    expect(buildSiweMessage(BASE)).toBe(buildSiweMessage({ ...BASE }));
  });

  it("throws on a malformed address", () => {
    expect(() => buildSiweMessage({ ...BASE, address: "not-an-address" })).toThrow(SiweError);
  });

  it("throws on a non-positive chainId", () => {
    expect(() => buildSiweMessage({ ...BASE, chainId: 0 })).toThrow(SiweError);
  });

  it.each(["domain", "statement", "uri", "nonce", "issuedAt"] as const)(
    "throws when required field %s is empty",
    (field) => {
      expect(() => buildSiweMessage({ ...BASE, [field]: "" })).toThrow(SiweError);
    },
  );
});

describe("parseSiweMessage", () => {
  it("round-trips build → parse (parse is the inverse of build)", () => {
    expect(parseSiweMessage(buildSiweMessage(BASE))).toStrictEqual(BASE);
  });

  it("round-trips with an expiration time", () => {
    const params = { ...BASE, expirationTime: "2024-01-15T11:30:00.000Z" };
    expect(parseSiweMessage(buildSiweMessage(params))).toStrictEqual(params);
  });

  it("parses chainId as a number", () => {
    expect(parseSiweMessage(buildSiweMessage({ ...BASE, chainId: 8453 })).chainId).toBe(8453);
  });

  it("rejects an empty string", () => {
    expect(() => parseSiweMessage("")).toThrow(SiweError);
  });

  it("rejects a message with a missing preamble", () => {
    expect(() => parseSiweMessage("garbage\n" + ADDR)).toThrow(SiweError);
  });

  it("rejects a message with an invalid address line", () => {
    const broken = buildSiweMessage(BASE).replace(ADDR, "0xnope");
    expect(() => parseSiweMessage(broken)).toThrow(SiweError);
  });

  it("rejects a message with a non-numeric Chain ID", () => {
    const broken = buildSiweMessage(BASE).replace("Chain ID: 1", "Chain ID: mainnet");
    expect(() => parseSiweMessage(broken)).toThrow(SiweError);
  });

  it("detects a tampered address (parsed address differs from expected)", () => {
    const other = "0x000000000000000000000000000000000000dead";
    const forged = buildSiweMessage({ ...BASE, address: other });
    expect(parseSiweMessage(forged).address).toBe(other);
    expect(parseSiweMessage(forged).address).not.toBe(ADDR);
  });
});

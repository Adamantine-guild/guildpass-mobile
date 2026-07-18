import { SiweMessage, SiweParams } from "./siwe.types";

/**
 * Sign-In With Ethereum (EIP-4361) message construction and parsing.
 *
 * `buildSiweMessage` produces the exact string a wallet signs; `parseSiweMessage`
 * is its inverse. Both are pure and deterministic — same input, same output — so
 * they belong to deterministic space (a script + tests), not model space. The
 * backend verifier parses the same format and checks the recovered signer, the
 * nonce (single-use), the domain, and the expiry.
 *
 * Format (EIP-4361), newline-delimited:
 *
 *   ${domain} wants you to sign in with your Ethereum account:
 *   ${address}
 *
 *   ${statement}
 *
 *   URI: ${uri}
 *   Version: ${version}
 *   Chain ID: ${chainId}
 *   Nonce: ${nonce}
 *   Issued At: ${issuedAt}
 *   Expiration Time: ${expirationTime}   ← only when present
 *
 * The blank lines around the statement are part of the spec. Do NOT reorder,
 * rename, or trim fields — the signer and verifier must agree byte-for-byte.
 */

const PREAMBLE_SUFFIX = " wants you to sign in with your Ethereum account:";

const FIELD_LABELS = {
  uri: "URI: ",
  version: "Version: ",
  chainId: "Chain ID: ",
  nonce: "Nonce: ",
  issuedAt: "Issued At: ",
  expirationTime: "Expiration Time: ",
} as const;

const EVM_ADDRESS_REGEX = /^0x[0-9a-fA-F]{40}$/;

export class SiweError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SiweError";
  }
}

function requireField(value: string | undefined, name: string): string {
  if (value === undefined || value === null || String(value).length === 0) {
    throw new SiweError(`SIWE message is missing required field: ${name}`);
  }
  return value;
}

/**
 * Build the canonical EIP-4361 message string from its parts.
 * @throws {SiweError} when a required field is empty or the address is malformed.
 */
export function buildSiweMessage(params: SiweParams): string {
  const domain = requireField(params.domain, "domain");
  const address = requireField(params.address, "address");
  const statement = requireField(params.statement, "statement");
  const uri = requireField(params.uri, "uri");
  const version = requireField(params.version, "version");
  const nonce = requireField(params.nonce, "nonce");
  const issuedAt = requireField(params.issuedAt, "issuedAt");

  if (!EVM_ADDRESS_REGEX.test(address)) {
    throw new SiweError(`SIWE address is not a valid EVM address: ${address}`);
  }
  if (!Number.isInteger(params.chainId) || params.chainId <= 0) {
    throw new SiweError(`SIWE chainId must be a positive integer: ${String(params.chainId)}`);
  }

  const lines = [
    `${domain}${PREAMBLE_SUFFIX}`,
    address,
    "",
    statement,
    "",
    `${FIELD_LABELS.uri}${uri}`,
    `${FIELD_LABELS.version}${version}`,
    `${FIELD_LABELS.chainId}${params.chainId}`,
    `${FIELD_LABELS.nonce}${nonce}`,
    `${FIELD_LABELS.issuedAt}${issuedAt}`,
  ];

  if (params.expirationTime) {
    lines.push(`${FIELD_LABELS.expirationTime}${params.expirationTime}`);
  }

  return lines.join("\n");
}

function readLabeled(line: string | undefined, label: string, name: string): string {
  if (line === undefined || !line.startsWith(label)) {
    throw new SiweError(`SIWE message malformed: expected "${name}" line`);
  }
  return line.slice(label.length);
}

/**
 * Parse a canonical EIP-4361 message back into its parts.
 * `parseSiweMessage(buildSiweMessage(p))` deep-equals `p` (with chainId as number).
 * @throws {SiweError} when the message does not match the canonical format.
 */
export function parseSiweMessage(message: string): SiweMessage {
  if (typeof message !== "string" || message.length === 0) {
    throw new SiweError("SIWE message must be a non-empty string");
  }

  const lines = message.split("\n");

  const preamble = lines[0] ?? "";
  if (!preamble.endsWith(PREAMBLE_SUFFIX)) {
    throw new SiweError("SIWE message malformed: missing preamble");
  }
  const domain = preamble.slice(0, preamble.length - PREAMBLE_SUFFIX.length);
  if (domain.length === 0) {
    throw new SiweError("SIWE message malformed: empty domain");
  }

  const address = lines[1] ?? "";
  if (!EVM_ADDRESS_REGEX.test(address)) {
    throw new SiweError(`SIWE message malformed: invalid address line "${address}"`);
  }

  // lines[2] blank, lines[3] statement, lines[4] blank
  if (lines[2] !== "") {
    throw new SiweError("SIWE message malformed: expected blank line after address");
  }
  const statement = lines[3] ?? "";
  if (statement.length === 0) {
    throw new SiweError("SIWE message malformed: empty statement");
  }
  if (lines[4] !== "") {
    throw new SiweError("SIWE message malformed: expected blank line after statement");
  }

  const uri = readLabeled(lines[5], FIELD_LABELS.uri, "URI");
  const version = readLabeled(lines[6], FIELD_LABELS.version, "Version");
  const chainIdRaw = readLabeled(lines[7], FIELD_LABELS.chainId, "Chain ID");
  const nonce = readLabeled(lines[8], FIELD_LABELS.nonce, "Nonce");
  const issuedAt = readLabeled(lines[9], FIELD_LABELS.issuedAt, "Issued At");

  const chainId = Number(chainIdRaw);
  if (!Number.isInteger(chainId) || chainId <= 0) {
    throw new SiweError(`SIWE message malformed: invalid Chain ID "${chainIdRaw}"`);
  }

  const parsed: SiweMessage = {
    domain,
    address,
    statement,
    uri,
    version,
    chainId,
    nonce,
    issuedAt,
  };

  if (lines[10] !== undefined) {
    parsed.expirationTime = readLabeled(lines[10], FIELD_LABELS.expirationTime, "Expiration Time");
  }

  return parsed;
}

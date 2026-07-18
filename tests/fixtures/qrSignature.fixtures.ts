import { ec as EC } from "elliptic";
import { keccak256 } from "js-sha3";
import { buildSigningMessage } from "../../src/features/access/qrSignature";
import {
  TEST_ISSUER_PRIVATE_KEY,
  TEST_ISSUER_PUBLIC_KEY,
} from "./guild.fixtures";

/**
 * Test helpers for producing real, verifiable QR payload signatures with the
 * shared test issuer keypair. These let the unit tests exercise the full
 * sign → verify path without a network or a real backend.
 */

const ec = new EC("secp256k1");

export { TEST_ISSUER_PRIVATE_KEY, TEST_ISSUER_PUBLIC_KEY };

export type QrPayloadFields = {
  guildId: string;
  resourceId: string;
  walletAddress?: string;
  expiresAt?: string;
};

/** Sign a payload's canonical message with the test issuer private key. */
export const signQrPayload = (fields: QrPayloadFields): string => {
  const message = buildSigningMessage(fields);
  const messageHash = keccak256(message);
  const keyPair = ec.keyFromPrivate(TEST_ISSUER_PRIVATE_KEY, "hex");
  // DER-encoded signature, lower-case hex. `messageHash` is the keccak256
  // digest as a hex string; elliptic signs it directly as the message value.
  return keyPair.sign(messageHash).toDER("hex");
};

/** Build a full QR payload object (with signature) ready to JSON.stringify. */
export const buildSignedQrPayload = (fields: QrPayloadFields) => ({
  type: "guildpass.access-check",
  version: 1,
  guildId: fields.guildId,
  resourceId: fields.resourceId,
  walletAddress: fields.walletAddress,
  expiresAt: fields.expiresAt,
  signature: signQrPayload(fields),
});

/** Build a raw (string) signed QR payload. */
export const buildSignedQrPayloadString = (fields: QrPayloadFields): string =>
  JSON.stringify(buildSignedQrPayload(fields));

/**
 * Canonical QR payload constants.
 *
 * Kept in their own module so both the parser (`qrPayload.ts`) and the
 * signature scheme (`qrSignature.ts`) can import them without a circular
 * dependency. These values are part of the wire contract — changing them is a
 * breaking change for every issued QR.
 */

export const ACCESS_QR_TYPE = "guildpass.access-check";
export const ACCESS_QR_VERSION = 1;

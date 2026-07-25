/**
 * Bootstrap registration of the credential issuer implementations that ship with
 * the app. Called explicitly from `app/_layout.tsx` alongside the other init
 * functions, rather than run as an import side-effect, so test suites control
 * when registration happens.
 *
 * Registering here affects discovery only. Verification paths hold direct
 * references to their own registry objects and keep working whether or not this
 * has run — see `credentialRegistry.ts`.
 */

import { qrAccessIssuerRegistry } from "../../features/access/guildIssuerKey";
import { attestationIssuerRegistry } from "../../features/attestation/issuerKeyRegistry";
import { registerCredentialIssuerRegistry } from "./credentialRegistry";

export function registerBuiltInIssuers(): void {
  registerCredentialIssuerRegistry(qrAccessIssuerRegistry);
  registerCredentialIssuerRegistry(attestationIssuerRegistry);
}

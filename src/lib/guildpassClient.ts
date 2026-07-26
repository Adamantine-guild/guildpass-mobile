import { GuildPassClient } from "@guildpass/sdk";
import { appConfig } from "../config/appConfig";

/**
 * GuildPass SDK client instance.
 *
 * IMPORTANT: All network traffic from this client to `apiUrl` is protected
 * by native-level certificate pinning (Android Network Security Config +
 * iOS NSAppTransportSecurity). This is enforced at the TLS layer regardless
 * of the JavaScript fetch implementation used by the SDK.
 *
 * For custom API calls outside the SDK, use `secureFetch` from
 * `@/lib/secureFetch` to ensure domain validation and device integrity
 * checks are applied.
 *
 * See:
 * - docs/threat-model.md — scope and limitations
 * - docs/pin-rotation-runbook.md — certificate rotation procedure
 */
export const guildPassClient = new GuildPassClient({
  apiUrl: appConfig.apiUrl,
  chainId: appConfig.chainId,
});

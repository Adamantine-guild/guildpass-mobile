import { AuthClient } from "./authClient";
import { appConfig } from "../../config/appConfig";

/**
 * Shared AuthClient for the app, pointed at the configured API.
 *
 * Uses the raw `globalThis.fetch` (NOT the authenticated fetch) on purpose: the
 * auth endpoints mint/rotate tokens and must never attach a stale bearer or
 * trigger the 401-refresh loop.
 */
export const authClient = new AuthClient({ apiUrl: appConfig.apiUrl });

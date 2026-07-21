/**
 * Security Initialization Hook
 *
 * Call `useSecurityInit()` once at app root (e.g., in `_layout.tsx`)
 * to initialize all security hardening features:
 *
 *  1. Device integrity assessment (root/jailbreak detection)
 *  2. Foreground re-validation with active-session invalidation
 *  3. Certificate pinning validation and logging
 *  4. Secure fetch initialization
 *
 * This hook is side-effect-only; it returns no state.
 */

import { useEffect, useRef } from "react";
import { AppState, AppStateStatus } from "react-native";
import { initializeSecureFetch } from "../lib/secureFetch";
import {
  assessDeviceIntegrity,
  configureDeviceIntegrity,
  getIntegrityResponsePolicy,
  checkIntegrityTransition,
} from "../features/security/deviceIntegrity";
import { useSessionStore } from "../features/session/session.store";
import { useIntegrityWarningStore } from "../features/security/integrityWarning.store";
import { logPinningStatus } from "../features/security/certificatePinning";
import { appConfig } from "../config/appConfig";

/**
 * Configure and initialize all security hardening features.
 *
 * Call once at app root. The hook handles:
 * - Initial integrity assessment
 * - Re-assessment on app foreground events (if configured)
 * - On detection of a secure→compromised transition:
 *   - `"block"` policy: immediately invalidates the active session
 *   - `"warn"` policy: surfaces a dismissible warning banner
 * - Pinning configuration logging
 */
export function useSecurityInit(): void {
  const hasRun = useRef(false);

  useEffect(() => {
    if (hasRun.current) return;
    hasRun.current = true;

    // -- Configure device integrity --
    const isProduction = appConfig.appEnv === "production";
    configureDeviceIntegrity({
      responsePolicy: isProduction ? "block" : "warn",
      checkOnForeground: true,
      minCheckIntervalMs: 60_000,
    });

    // -- Run initial integrity assessment --
    const result = assessDeviceIntegrity(true);
    if (!result.isSecure) {
      const failures = result.checks
        .filter((c) => !c.passed)
        .map((c) => `${c.check}: ${c.detail ?? "failed"}`)
        .join("; ");
      console.warn(
        `[GuildPass Security] Device integrity check FAILED: ${failures}`,
      );
    } else {
      console.log("[GuildPass Security] Device integrity check PASSED.");
    }

    // -- Initialize secure fetch --
    initializeSecureFetch();
    logPinningStatus();

    // -- Re-assess on foreground with transition detection --
    let isHandlingCompromise = false;

    const handleAppStateChange = (nextState: AppStateStatus) => {
      if (nextState !== "active") return;

      const transition = checkIntegrityTransition();

      if (transition !== "secure_to_compromised") return;

      // Guard against rapid background/foreground cycles
      if (isHandlingCompromise) {
        console.warn(
          "[GuildPass Security] Already handling a compromise detection — skipping.",
        );
        return;
      }
      isHandlingCompromise = true;

      const policy = getIntegrityResponsePolicy();

      if (policy === "block") {
        // Set a detailed explanation *before* invalidating so the login screen
        // can read it if it renders synchronously after the state change.
        useIntegrityWarningStore.getState().setWarning(
          "Device compromised — session terminated.",
          "blocked_session",
          "Your session was terminated because device integrity checks " +
          "detected that your device may be rooted or jailbroken. " +
          "Please secure your device and try again.",
        );

        // Invalidate the active session — forces the user to re-authenticate.
        useSessionStore.getState().endSession().catch(() => {
          console.error(
            "[GuildPass Security] Failed to end session after compromise detection.",
          );
        }).finally(() => {
          isHandlingCompromise = false;
        });

        console.warn(
          "[GuildPass Security] Device integrity violation detected on foreground — " +
          "session invalidated per 'block' policy. User must re-authenticate.",
        );
      } else {
        // 'warn' policy — surface a dismissible warning so the user stays
        // informed without being forcibly logged out.
        useIntegrityWarningStore.getState().setWarning(
          "Device integrity has changed since the last check. " +
          "Your device may be rooted or jailbroken. " +
          "Please verify your device security.",
          "warned_user",
          null,
        );
        isHandlingCompromise = false;

        console.warn(
          "[GuildPass Security] Device integrity violation detected on foreground — " +
          "warning displayed per 'warn' policy.",
        );
      }
    };

    const subscription = AppState.addEventListener(
      "change",
      handleAppStateChange,
    );

    return () => {
      subscription.remove();
    };
  }, []);
}

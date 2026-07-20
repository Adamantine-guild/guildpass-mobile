/**
 * Security Initialization Hook
 *
 * Call `useSecurityInit()` once at app root (e.g., in `_layout.tsx`)
 * to initialize all security hardening features:
 *
 *  1. Device integrity assessment (root/jailbreak detection)
 *  2. Certificate pinning validation and logging
 *  3. Secure fetch initialization
 *
 * This hook is side-effect-only; it returns no state.
 */

import { useEffect, useRef } from "react";
import { AppState, AppStateStatus } from "react-native";
import { initializeSecureFetch } from "../lib/secureFetch";
import {
  assessDeviceIntegrity,
  configureDeviceIntegrity,
} from "../features/security/deviceIntegrity";
import { logPinningStatus } from "../features/security/certificatePinning";
import { appConfig } from "../config/appConfig";

/**
 * Configure and initialize all security hardening features.
 *
 * Call once at app root. The hook handles:
 * - Initial integrity assessment
 * - Re-assessment on app foreground events (if configured)
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

    // -- Re-assess on foreground --
    const handleAppStateChange = (nextState: AppStateStatus) => {
      if (nextState === "active") {
        const freshResult = assessDeviceIntegrity(true);
        if (!freshResult.isSecure) {
          console.warn(
            "[GuildPass Security] Device integrity violation detected on foreground.",
          );
        }
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

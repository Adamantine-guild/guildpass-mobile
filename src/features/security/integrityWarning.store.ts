/**
 * Integrity Warning Store
 *
 * Manages the state for device integrity warnings that are surfaced to the user
 * when the `responsePolicy` is `"warn"` and a secure→compromised transition is
 * detected on app foreground.
 *
 * Under the `"block"` policy the session is invalidated outright, so no warning
 * state is needed — the user is simply logged out. Under `"warn"` we let the
 * store drive a dismissible banner so the user stays informed without being
 * forcibly logged out.
 */

import { create } from "zustand";

export type CompromiseAction = "none" | "blocked_session" | "warned_user";

interface IntegrityWarningState {
  /** Non-null when a compromise warning should be shown to the user. */
  message: string | null;
  /** Timestamp (epoch ms) of when the compromise was first detected. */
  detectedAt: number | null;
  /**
   * The action that was taken in response to the detected compromise.
   * - `"none"`: no compromise detected / cleared
   * - `"blocked_session"`: session was invalidated under block policy
   * - `"warned_user"`: a dismissible warning was shown under warn policy
   */
  action: CompromiseAction;
  /**
   * Human-readable explanation of why the compromise action was taken.
   * Displayed on the login/onboarding screen when `action === "blocked_session"`
   * so the user understands why they were logged out.
   */
  reason: string | null;

  /** Set (or clear) the warning message. */
  setWarning: (message: string | null, action?: CompromiseAction, reason?: string | null) => void;
  /** Dismiss the current warning (user-initiated). */
  dismissWarning: () => void;
}

export const useIntegrityWarningStore = create<IntegrityWarningState>()((set) => ({
  message: null,
  detectedAt: null,
  action: "none",
  reason: null,

  setWarning(message, action = "none", reason = null) {
    set({
      message,
      detectedAt: message ? Date.now() : null,
      action,
      reason,
    });
  },

  dismissWarning() {
    set({ message: null, detectedAt: null, action: "none", reason: null });
  },
}));

/** Convenience getter for non-reactive contexts. */
export function getIntegrityWarningMessage(): string | null {
  return useIntegrityWarningStore.getState().message;
}

/** Convenience action for non-reactive contexts. */
export function dismissIntegrityWarning(): void {
  useIntegrityWarningStore.getState().dismissWarning();
}

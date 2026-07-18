import React, { useEffect, useState } from "react";
import { View, Text } from "react-native";
import * as LocalAuthentication from "expo-local-authentication";
import { useBiometricStore } from "./biometric.store";
import { Button } from "../../components/Button";

interface BiometricGateProps {
  children: React.ReactNode;
  /** Reason shown in the biometric prompt dialog */
  promptMessage?: string;
  /** Called when authentication succeeds */
  onAuthenticated?: () => void;
  /** Called when the user cancels or fails */
  onCancel?: () => void;
}

type AuthState = "idle" | "checking" | "prompting" | "authenticated" | "failed" | "unavailable";

/**
 * Wraps children behind an optional biometric authentication gate.
 * When biometric is enabled in settings, it prompts for Face ID / Touch ID
 * before rendering children. If disabled, children render immediately.
 */
export function BiometricGate({
  children,
  promptMessage = "Authenticate to continue",
  onAuthenticated,
  onCancel,
}: BiometricGateProps) {
  const biometricRequired = useBiometricStore((s) => s.biometricRequired);
  const [authState, setAuthState] = useState<AuthState>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!biometricRequired) {
      setAuthState("authenticated");
      return;
    }

    let cancelled = false;

    async function authenticate() {
      setAuthState("checking");

      try {
        const hasHardware = await LocalAuthentication.hasHardwareAsync();
        const isEnrolled = await LocalAuthentication.isEnrolledAsync();

        if (!hasHardware || !isEnrolled) {
          if (!cancelled) {
            setAuthState("unavailable");
            setErrorMessage(
              "Biometric authentication is not available on this device. " +
                "You can disable this requirement in Settings."
            );
          }
          return;
        }

        if (!cancelled) {
          setAuthState("prompting");
        }

        const result = await LocalAuthentication.authenticateAsync({
          promptMessage,
          fallbackLabel: "Use device passcode",
          disableDeviceFallback: false,
        });

        if (cancelled) return;

        if (result.success) {
          setAuthState("authenticated");
          onAuthenticated?.();
        } else {
          setAuthState("failed");
          setErrorMessage(
            result.error === "user_cancel"
              ? "Authentication was cancelled."
              : result.error === "lockout"
                ? "Too many attempts. Please try again later."
                : "Authentication failed. Please try again."
          );
        }
      } catch {
        if (!cancelled) {
          setAuthState("failed");
          setErrorMessage("Unable to authenticate. Please try again.");
        }
      }
    }

    authenticate();

    return () => {
      cancelled = true;
    };
  }, [biometricRequired, promptMessage, onAuthenticated]);

  // Biometric not required — render immediately
  if (authState === "authenticated") {
    return <>{children}</>;
  }

  // Loading / checking biometric availability
  if (authState === "checking" || authState === "prompting") {
    return (
      <View className="flex-1 bg-background items-center justify-center px-6">
        <Text className="text-text text-lg font-medium mb-2">
          {authState === "checking" ? "Checking security..." : "Authenticating..."}
        </Text>
        <Text className="text-text-muted text-sm text-center">
          {authState === "prompting"
            ? "Please use Face ID, Touch ID, or your device passcode."
            : "Verifying biometric availability."}
        </Text>
      </View>
    );
  }

  // Failed or unavailable — show retry / settings option
  return (
    <View className="flex-1 bg-background items-center justify-center px-6">
      <Text className="text-error text-lg font-bold mb-2">
        {authState === "unavailable" ? "Biometrics Unavailable" : "Authentication Failed"}
      </Text>
      <Text className="text-text-muted text-sm text-center mb-6">{errorMessage}</Text>
      <View className="w-full gap-3">
        {authState === "failed" && (
          <Button
            title="Try Again"
            onPress={() => {
              setAuthState("idle");
              setErrorMessage(null);
            }}
          />
        )}
        <Button
          title="Go Back"
          variant="outline"
          onPress={onCancel}
        />
      </View>
    </View>
  );
}

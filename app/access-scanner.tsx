import { View, Text, ActivityIndicator, AccessibilityInfo, Animated, Platform } from "react-native";
import React, { useEffect, useRef, useState } from "react";
import { useRouter } from "expo-router";
import { CameraView, useCameraPermissions } from "expo-camera";
import type { BarcodeScanningResult } from "expo-camera";
import * as Linking from "expo-linking";
import { AppHeader } from "../src/components/AppHeader";
import { Button } from "../src/components/Button";
import { Card } from "../src/components/Card";
import { verifyAndParseAccessQrPayload, QrValidationResult } from "../src/features/access/verifyQrPayload";
import { describeQrSignatureError, QR_SIGNATURE_ERROR_CODES, QrSignatureErrorCode, QrSignatureError } from "../src/features/access/qrSignature";
import { describeQrPayloadError, QR_PAYLOAD_ERROR_CODES, QrPayloadErrorCode, QrPayloadError } from "../src/features/access/qrPayload";
import { verifyAndParseAccessQrPayload } from "../src/features/access/verifyQrPayload";
import { describeQrSignatureError, QrSignatureError, QR_SIGNATURE_ERROR_CODES } from "../src/features/access/qrSignature";
import {
  ACCESS_QR_TYPE,
  ACCESS_QR_VERSION,
  describeQrPayloadError,
  QR_PAYLOAD_ERROR_CODES,
  QrPayloadError,
} from "../src/features/access/qrPayload";
import { AccessHistoryList } from "../src/components/AccessHistoryList";
import { useAccessHistoryStore } from "../src/features/access/accessHistory.store";

type AccessibleCameraViewProps = React.ComponentProps<typeof CameraView> & {
  accessibilityLabel?: string;
  accessibilityHint?: string;
  accessibilityLiveRegion?: "none" | "polite" | "assertive";
};

const AccessibleCameraView = CameraView as React.ComponentType<AccessibleCameraViewProps>;

const TEST_QR_PAYLOADS = {
  expired: JSON.stringify({
    type: ACCESS_QR_TYPE,
    version: ACCESS_QR_VERSION,
    guildId: "guild_abc",
    resourceId: "vip-door",
    expiresAt: "2000-01-01T00:00:00.000Z",
    kid: "test-key",
    signature: "00",
  }),
  unsupportedVersion: JSON.stringify({
    type: ACCESS_QR_TYPE,
    version: 999,
    guildId: "guild_abc",
    resourceId: "vip-door",
    expiresAt: "2999-01-01T00:00:00.000Z",
    kid: "test-key",
    signature: "00",
  }),
  malformedJson: "{ this is not a GuildPass QR payload",
};

const AUTO_RESET_DELAY_MS = 3000;

const isUntrustedPayloadError = (error: QrPayloadError) =>
  error.code === QR_PAYLOAD_ERROR_CODES.INVALID_SIGNATURE ||
  error.code === QR_PAYLOAD_ERROR_CODES.UNSUPPORTED_VERSION ||
  error.code === QR_PAYLOAD_ERROR_CODES.INVALID_KID;

/** Determines whether a scan error should auto-reset or require manual dismissal. */
const isRecoverableError = (error: unknown): boolean => {
  if (error instanceof QrSignatureError) {
    // KEY_REGISTRY_EXPIRED and PUBLIC_KEY_UNAVAILABLE are network-recoverable;
    // all other signature errors indicate untrusted/malicious QR codes.
    return (
      error.code === QR_SIGNATURE_ERROR_CODES.KEY_REGISTRY_EXPIRED ||
      error.code === QR_SIGNATURE_ERROR_CODES.PUBLIC_KEY_UNAVAILABLE
    );
  }
  if (error instanceof QrPayloadError) {
    return !isUntrustedPayloadError(error);
  }
  // Unexpected errors are treated as recoverable (likely transient).
  return true;
};

export default function AccessScanner() {
  const router = useRouter();
  const [permission, requestPermission] = useCameraPermissions();
  const [scanError, setScanError] = useState<{ message: string; isUntrusted: boolean } | null>(null);
  const [scanError, setScanError] = useState<{ message: string; isUntrusted: boolean } | null>(
    null,
  );
  const [isProcessingScan, setIsProcessingScan] = useState(false);
  const [verificationSuccess, setVerificationSuccess] = useState(false);
  const scanInProgressRef = useRef(false);

  // Animation values
  const successScale = useRef(new Animated.Value(0)).current;
  const successOpacity = useRef(new Animated.Value(0)).current;
  const checkmarkScale = useRef(new Animated.Value(0)).current;
  const errorSlide = useRef(new Animated.Value(20)).current;
  const errorOpacity = useRef(new Animated.Value(0)).current;

  const entries = useAccessHistoryStore((state) => state.entries);
  const clearHistory = useAccessHistoryStore((state) => state.clearHistory);

  // Auto-reset recoverable errors after a short delay
  useEffect(() => {
    if (!scanError || scanError.isUntrusted) {
      return;
    }

    const timer = setTimeout(() => {
      scanInProgressRef.current = false;
      setScanError(null);
      setIsProcessingScan(false);
      errorSlide.setValue(20);
      errorOpacity.setValue(0);
    }, AUTO_RESET_DELAY_MS);

    return () => clearTimeout(timer);
  }, [scanError]);

  // Animate error card entrance
  useEffect(() => {
    if (scanError) {
      Animated.parallel([
        Animated.spring(errorSlide, {
          toValue: 0,
          friction: 8,
          tension: 100,
          useNativeDriver: true,
        }),
        Animated.timing(errorOpacity, {
          toValue: 1,
          duration: 250,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [scanError, errorSlide, errorOpacity]);

  const handleScanData = async (data: string) => {
    if (scanInProgressRef.current) {
      return;
    }

    scanInProgressRef.current = true;
    setIsProcessingScan(true);
    setVerificationSuccess(false);
    setScanError(null);
    AccessibilityInfo.announceForAccessibility("Processing access QR code.");

    const result = await verifyAndParseAccessQrPayload(data);

    try {
      AccessibilityInfo.announceForAccessibility("Processing access QR code.");
      await verifyAndParseAccessQrPayload(data);
      setVerificationSuccess(true);
      AccessibilityInfo.announceForAccessibility("Signature verified. Opening access check.");
      
      setTimeout(() => {
        setVerificationSuccess(false);
        router.replace({ pathname: "/access-check", params: { qrPayload: data } });
      }, 1500);
      return;
    try {
      AccessibilityInfo.announceForAccessibility("Processing access QR code.");
      const result = await verifyAndParseAccessQrPayload(data);
      setVerificationSuccess(true);
      AccessibilityInfo.announceForAccessibility("Signature verified. Opening access check.");
    try {
      AccessibilityInfo.announceForAccessibility("Processing access QR code.");
      const result = await verifyAndParseAccessQrPayload(data);
      await verifyAndParseAccessQrPayload(data);
      setIsProcessingScan(false);
      setVerificationSuccess(true);
      AccessibilityInfo.announceForAccessibility("QR code accepted. Opening access check.");

      // Animate success: scale in the card, then scale the checkmark
      successScale.setValue(0);
      successOpacity.setValue(0);
      checkmarkScale.setValue(0);

      Animated.sequence([
        Animated.parallel([
          Animated.spring(successScale, {
            toValue: 1,
            friction: 6,
            tension: 80,
            useNativeDriver: true,
          }),
          Animated.timing(successOpacity, {
            toValue: 1,
            duration: 200,
            useNativeDriver: true,
          }),
        ]),
        Animated.spring(checkmarkScale, {
          toValue: 1,
          friction: 4,
          tension: 120,
          useNativeDriver: true,
        }),
        Animated.timing(successOpacity, {
          toValue: 0,
          duration: 400,
          delay: 800,
          useNativeDriver: true,
        }),
      ]).start(() => {
        setVerificationSuccess(false);
        router.replace({ pathname: "/access-check", params: { qrPayload: data } });
      });
    } catch (error) {
      let errorMessage = "Unable to read QR payload.";
      let isUntrusted = false;

      if (error instanceof QrSignatureError) {
        errorMessage = describeQrSignatureError(error.code);
        isUntrusted = true;
        isUntrusted = !isRecoverableError(error);
      } else if (error instanceof QrPayloadError) {
        if (
          error.code === QR_PAYLOAD_ERROR_CODES.INVALID_SIGNATURE ||
          error.code === QR_PAYLOAD_ERROR_CODES.UNSUPPORTED_VERSION ||
          error.code === QR_PAYLOAD_ERROR_CODES.INVALID_KID
        ) {
          errorMessage = error.message;
          isUntrusted = true;
        } else if (error.code === QR_PAYLOAD_ERROR_CODES.ALREADY_USED) {
          errorMessage = "This QR code has already been used.";
        } else {
          errorMessage = error.message;
        }
      } else if (error instanceof Error) {
        errorMessage = error.message;
        errorMessage = describeQrPayloadError(error.code);
        isUntrusted = !isRecoverableError(error);
      }

      setScanError({ message: errorMessage, isUntrusted });
      AccessibilityInfo.announceForAccessibility(`QR code rejected. ${errorMessage}`);
      setIsProcessingScan(false);
      scanInProgressRef.current = false;
    }
  };

  const handleBarcodeScanned = ({ data }: BarcodeScanningResult) => {
    void handleScanData(data);
  };

  const handleScanAgain = () => {
    scanInProgressRef.current = false;
    setScanError(null);
    setIsProcessingScan(false);
    errorSlide.setValue(20);
    errorOpacity.setValue(0);
  };

  const getPermissionInstructions = (): string => {
    if (Platform.OS === "ios") {
      return "Open Settings > Privacy & Security > Camera, and enable camera access for GuildPass.";
    }
    return "Open Settings > Apps > GuildPass > Permissions, and enable camera access.";
  };

  if (!permission) {
    return (
      <View className="flex-1 bg-background dark:bg-slate-900">
        <AppHeader title="Scan Access QR" showBack />
        <View className="flex-1 px-4 py-6">
          <Card>
            <Text accessibilityLiveRegion="polite" className="text-text-muted dark:text-slate-400">Checking camera permission...</Text>
            <Text accessibilityLiveRegion="polite" className="text-text-muted dark:text-slate-400">
              Checking camera permission...
            </Text>
          </Card>
        </View>
      </View>
    );
  }

  if (!permission.granted) {
    const permissionDenied = permission.status === "denied";
    const permissionMessage = permissionDenied
      ? permission.canAskAgain
        ? "Camera permission was denied. Please allow camera access to scan QR codes."
        : `Camera permission was permanently denied. ${getPermissionInstructions()}`
      : "GuildPass needs camera permission to scan access check QR codes.";

    return (
      <View className="flex-1 bg-background dark:bg-slate-900">
        <AppHeader title="Scan Access QR" showBack />
        <View className="flex-1 px-4 py-6">
          <Card>
            <Text accessibilityRole="header" className="text-xl font-bold text-text dark:text-slate-100 mb-2">Camera access needed</Text>
            <Text accessibilityLiveRegion="polite" className="text-text-muted dark:text-slate-400 mb-6">
              GuildPass needs camera permission to scan access check QR codes.
            <Text
              accessibilityRole="header"
              className="text-xl font-bold text-text dark:text-slate-100 mb-2"
            >
              {permissionDenied ? "Camera permission denied" : "Camera access needed"}
            </Text>
            <Text
              accessibilityRole={permissionDenied ? "alert" : undefined}
              accessibilityLiveRegion={permissionDenied ? "assertive" : "polite"}
              className={
                permissionDenied
                  ? "text-error dark:text-red-400 mb-6"
                  : "text-text-muted dark:text-slate-400 mb-6"
              }
            >
              {permissionMessage}
            </Text>

            {permission.canAskAgain ? (
              <Button
                title="Allow Camera Access"
                accessibilityLabel="Allow Camera Access"
                onPress={requestPermission}
              />
            ) : (
              <>
                <Text accessibilityRole="alert" accessibilityLiveRegion="assertive" className="text-error dark:text-red-400">
                  Camera permission was denied. Enable camera access in your device settings to scan
                  QR codes.
                </Text>
                <Text accessibilityRole="alert" accessibilityLiveRegion="assertive" className="text-error dark:text-red-400 mb-6">
                  Camera permission was denied. Open Settings to enable camera access for GuildPass.
                </Text>
                <Button
                  title="Open Settings"
                  onPress={() => Linking.openSettings()}
                  variant="outline"
                />
              </>
              <Button
                title="Open Settings"
                onPress={() => Linking.openSettings()}
                variant="outline"
              />
            )}
          </Card>
        </View>
      </View>
    );
  }

  if (isProcessingScan) {
    return (
      <View accessibilityLabel="Processing access QR code" accessibilityState={{ busy: true }} className="flex-1 bg-background dark:bg-slate-900 justify-center items-center">
        <AppHeader title="Scan Access QR" showBack />
        <ActivityIndicator size="large" accessibilityLabel="Processing access QR code" accessibilityLiveRegion="polite" />
        <Text accessibilityLiveRegion="polite" className="mt-4 text-text dark:text-slate-100">Processing...</Text>
      <View
        accessibilityLabel="Verifying access QR code"
        accessibilityState={{ busy: true }}
        className="flex-1 bg-background dark:bg-slate-900 justify-center items-center"
      >
        <AppHeader title="Scan Access QR" showBack />
        <View className="flex-1 justify-center items-center px-6">
          <ActivityIndicator
            size="large"
            accessibilityLabel="Verifying access QR code"
            accessibilityLiveRegion="polite"
            className="mb-6"
          />
          <Text
            accessibilityLiveRegion="polite"
            className="text-text dark:text-slate-100 text-lg font-semibold text-center mb-2"
          >
            Verifying QR code
          </Text>
          <Text className="text-text-muted dark:text-slate-400 text-sm text-center">
            Checking signature and security...
          </Text>
        </View>
      </View>
    );
  }

  if (verificationSuccess) {
    return (
      <View accessibilityLabel="Signature verified" accessibilityState={{ busy: true }} className="flex-1 bg-background dark:bg-slate-900 justify-center items-center">
        <AppHeader title="Scan Access QR" showBack />
        <View className="flex-1 px-4 py-6 justify-center w-full">
          <Card className="border-success dark:border-green-600 bg-success/5 dark:bg-green-900/30 items-center py-8">
            <Text className="text-success dark:text-green-400 text-4xl mb-4 font-bold">✓</Text>
            <Text className="text-success dark:text-green-400 font-bold text-xl">Signature verified</Text>
            <Text className="text-success/80 dark:text-green-400/80 mt-2 text-center">Redirecting to access check...</Text>
          </Card>
        </View>
      <View
        accessibilityLabel="QR code verified successfully"
        className="flex-1 bg-background dark:bg-slate-900 justify-center items-center"
      >
        <AppHeader title="Scan Access QR" showBack />
        <Animated.View
          className="flex-1 px-4 py-6 justify-center w-full"
          style={{
            opacity: successOpacity,
            transform: [{ scale: successScale }],
          }}
        >
          <Card className="border-success dark:border-green-600 bg-success/5 dark:bg-green-900/30 items-center py-8">
            <Animated.Text
              className="text-success dark:text-green-400 text-5xl mb-4 font-bold"
              style={{
                transform: [{ scale: checkmarkScale }],
              }}
            >
              ✓
            </Animated.Text>
            <Text className="text-success dark:text-green-400 font-bold text-xl">
              Signature verified
            </Text>
            <Text className="text-success/80 dark:text-green-400/80 mt-2 text-center">
              Redirecting to access check...
            </Text>
          </Card>
        </Animated.View>
      </View>
    );
  }

  if (scanError) {
    const isUntrusted = scanError.isUntrusted;
    const isAutoResetting = !isUntrusted;

    return (
      <View className="flex-1 bg-background dark:bg-slate-900">
        <AppHeader title="Scan Access QR" showBack />
        <View className="flex-1 px-4 py-6">
          <Card className={isUntrusted ? "border-amber-500 bg-amber-500/10 dark:border-amber-600 dark:bg-amber-900/30" : "border-error bg-error/5 dark:border-red-600 dark:bg-red-900/30"}>
            <Text accessibilityRole="alert" accessibilityLiveRegion="assertive" className={isUntrusted ? "text-amber-600 dark:text-amber-400 font-bold text-lg" : "text-error dark:text-red-400 font-bold text-lg"}>
              {isUntrusted ? "Untrusted QR code" : "QR code rejected"}
            </Text>
            <Text accessibilityRole="alert" accessibilityLiveRegion="assertive" className={isUntrusted ? "text-amber-700/80 dark:text-amber-300/80 text-sm mt-1 mb-4" : "text-error/80 dark:text-red-300/80 text-sm mt-1 mb-4"}>
              {scanError.message}
            </Text>
            <Button title="Scan Again" onPress={handleScanAgain} variant="outline" />
          </Card>
          <Animated.View
            style={{
              transform: [{ translateY: errorSlide }],
              opacity: errorOpacity,
            }}
          >
            <Card
              className={
                isUntrusted
                  ? "border-amber-500 bg-amber-500/10 dark:border-amber-600 dark:bg-amber-900/30"
                  : "border-error bg-error/5 dark:border-red-600 dark:bg-red-900/30"
              }
              testID={isUntrusted ? "access-scanner-untrusted-error" : "access-scanner-error"}
            >
              <View className="flex-row items-center mb-2">
                <Text
                  className={
                    isUntrusted
                      ? "text-amber-600 dark:text-amber-400 text-2xl mr-2"
                      : "text-error dark:text-red-400 text-2xl mr-2"
                  }
                >
                  {isUntrusted ? "⚠" : "✗"}
                </Text>
                <Text
                  accessibilityRole="alert"
                  accessibilityLiveRegion="assertive"
                  className={
                    isUntrusted
                      ? "text-amber-600 dark:text-amber-400 font-bold text-lg flex-1"
                      : "text-error dark:text-red-400 font-bold text-lg flex-1"
                  }
                  testID="access-scanner-error-title"
                >
                  {isUntrusted ? "Untrusted QR code" : "QR code rejected"}
                </Text>
              </View>
              <Text
                accessibilityRole="alert"
                accessibilityLiveRegion="assertive"
                className={
                  isUntrusted
                    ? "text-amber-700/80 dark:text-amber-300/80 text-sm mb-2"
                    : "text-error/80 dark:text-red-300/80 text-sm mb-2"
                }
                testID="access-scanner-error-message"
              >
                {scanError.message}
              </Text>
              {isAutoResetting && (
                <Text className="text-text-muted dark:text-slate-400 text-xs mb-4">
                  Scanner will automatically resume...
                </Text>
              )}
              <Button
                title={isAutoResetting ? "Scan Again Now" : "Scan Again"}
                accessibilityLabel={isAutoResetting ? "Scan Again Now" : "Scan Again"}
                onPress={handleScanAgain}
                variant="outline"
              />
            </Card>
          </Animated.View>
        </View>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-background dark:bg-slate-900">
      <AppHeader title="Scan Access QR" showBack />
      <View className="flex-1">
        <AccessibleCameraView
          accessibilityLabel="Scanning for GuildPass access QR code"
          accessibilityHint="Point the camera at a GuildPass QR code to start access verification"
          accessibilityLiveRegion="polite"
          style={{ flex: 1 }}
          facing="back"
          onBarcodeScanned={handleBarcodeScanned}
          barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
        />
        <View className="absolute left-4 right-4 bottom-4">
          <Card className="mb-4">
            <Text accessibilityLiveRegion="polite" className="text-text dark:text-slate-100 font-medium text-center">
            <Text
              accessibilityLiveRegion="polite"
              className="text-text dark:text-slate-100 font-medium text-center"
            >
              Point your camera at a GuildPass access QR code.
            </Text>
          </Card>
          <AccessHistoryList entries={entries} onClear={clearHistory} />
        </View>

        {__DEV__ && (
          <View className="absolute top-4 right-4 w-48">
            <Button
              title="Test: Expired QR"
              onPress={() => {
                void handleScanData(TEST_QR_PAYLOADS.expired);
              }}
              className="mb-2 py-2 px-3"
              testID="test-expired-qr-scan"
            />
            <Button
              title="Test: Unsupported QR"
              onPress={() => {
                void handleScanData(TEST_QR_PAYLOADS.unsupportedVersion);
              }}
              className="mb-2 py-2 px-3"
              testID="test-unsupported-qr-version-scan"
            />
            <Button
              title="Test: Malformed QR"
              onPress={() => {
                setScanError({ message: "This QR code has expired.", isUntrusted: false });
                setIsProcessingScan(false);
                scanInProgressRef.current = true;
                void handleScanData(TEST_QR_PAYLOADS.malformedJson);
              }}
              className="py-2 px-3"
              testID="test-malformed-qr-json-scan"
            />
          </View>
        )}
      </View>
    </View>
  );
}

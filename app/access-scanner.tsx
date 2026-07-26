import { View, Text, ActivityIndicator, AccessibilityInfo } from "react-native";
import React, { useRef, useState } from "react";
import { useRouter } from "expo-router";
import { CameraView, useCameraPermissions } from "expo-camera";
import type { BarcodeScanningResult } from "expo-camera";
import * as Linking from "expo-linking";
import { AppHeader } from "../src/components/AppHeader";
import { Button } from "../src/components/Button";
import { Card } from "../src/components/Card";
import { verifyAndParseAccessQrPayload } from "../src/features/access/verifyQrPayload";
import { describeQrSignatureError, QrSignatureError } from "../src/features/access/qrSignature";
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

const isUntrustedPayloadError = (error: QrPayloadError) =>
  error.code === QR_PAYLOAD_ERROR_CODES.INVALID_SIGNATURE ||
  error.code === QR_PAYLOAD_ERROR_CODES.UNSUPPORTED_VERSION ||
  error.code === QR_PAYLOAD_ERROR_CODES.INVALID_KID;

export default function AccessScanner() {
  const router = useRouter();
  const [permission, requestPermission] = useCameraPermissions();
  const [scanError, setScanError] = useState<{ message: string; isUntrusted: boolean } | null>(
    null,
  );
  const [isProcessingScan, setIsProcessingScan] = useState(false);
  const [verificationSuccess, setVerificationSuccess] = useState(false);
  const scanInProgressRef = useRef(false);
  const entries = useAccessHistoryStore((state) => state.entries);
  const clearHistory = useAccessHistoryStore((state) => state.clearHistory);

  const handleScanData = async (data: string) => {
    if (scanInProgressRef.current) {
      return;
    }

    scanInProgressRef.current = true;
    setIsProcessingScan(true);
    setVerificationSuccess(false);
    setScanError(null);
    AccessibilityInfo.announceForAccessibility("Processing access QR code.");

    try {
      await verifyAndParseAccessQrPayload(data);
      setIsProcessingScan(false);
      setVerificationSuccess(true);
      AccessibilityInfo.announceForAccessibility("QR code accepted. Opening access check.");

      setTimeout(() => {
        setVerificationSuccess(false);
        router.replace({ pathname: "/access-check", params: { qrPayload: data } });
      }, 1500);
    } catch (error) {
      let errorMessage = "Unable to read QR payload.";
      let isUntrusted = false;

      if (error instanceof QrSignatureError) {
        errorMessage = describeQrSignatureError(error.code);
        isUntrusted = true;
      } else if (error instanceof QrPayloadError) {
        errorMessage = describeQrPayloadError(error.code);
        isUntrusted = isUntrustedPayloadError(error);
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
  };

  if (!permission) {
    return (
      <View className="flex-1 bg-background dark:bg-slate-900">
        <AppHeader title="Scan Access QR" showBack />
        <View className="flex-1 px-4 py-6">
          <Card>
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
        : "Camera permission was permanently denied. Open Settings to enable camera access for GuildPass to scan QR codes."
      : "GuildPass needs camera permission to scan access check QR codes.";

    return (
      <View className="flex-1 bg-background dark:bg-slate-900">
        <AppHeader title="Scan Access QR" showBack />
        <View className="flex-1 px-4 py-6">
          <Card>
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
                accessibilityRole="button"
                accessibilityLabel="Allow Camera Access"
                onPress={requestPermission}
              />
            ) : (
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
      <View
        accessibilityLabel="Processing access QR code"
        accessibilityState={{ busy: true }}
        className="flex-1 bg-background dark:bg-slate-900 justify-center items-center"
      >
        <AppHeader title="Scan Access QR" showBack />
        <ActivityIndicator
          size="large"
          accessibilityLabel="Processing access QR code"
          accessibilityLiveRegion="polite"
        />
        <Text accessibilityLiveRegion="polite" className="mt-4 text-text dark:text-slate-100">
          Processing...
        </Text>
      </View>
    );
  }

  if (verificationSuccess) {
    return (
      <View
        accessibilityLabel="Signature verified"
        accessibilityState={{ busy: true }}
        className="flex-1 bg-background dark:bg-slate-900 justify-center items-center"
      >
        <AppHeader title="Scan Access QR" showBack />
        <View className="flex-1 px-4 py-6 justify-center w-full">
          <Card className="border-success dark:border-green-600 bg-success/5 dark:bg-green-900/30 items-center py-8">
            <Text className="text-success dark:text-green-400 text-4xl mb-4 font-bold">✓</Text>
            <Text className="text-success dark:text-green-400 font-bold text-xl">
              Signature verified
            </Text>
            <Text className="text-success/80 dark:text-green-400/80 mt-2 text-center">
              Redirecting to access check...
            </Text>
          </Card>
        </View>
      </View>
    );
  }

  if (scanError) {
    const isUntrusted = scanError.isUntrusted;

    return (
      <View className="flex-1 bg-background dark:bg-slate-900">
        <AppHeader title="Scan Access QR" showBack />
        <View className="flex-1 px-4 py-6">
          <Card
            className={
              isUntrusted
                ? "border-amber-500 bg-amber-500/10 dark:border-amber-600 dark:bg-amber-900/30"
                : "border-error bg-error/5 dark:border-red-600 dark:bg-red-900/30"
            }
            testID={isUntrusted ? "access-scanner-untrusted-error" : "access-scanner-error"}
          >
            <Text
              accessibilityRole="alert"
              accessibilityLiveRegion="assertive"
              className={
                isUntrusted
                  ? "text-amber-600 dark:text-amber-400 font-bold text-lg"
                  : "text-error dark:text-red-400 font-bold text-lg"
              }
              testID="access-scanner-error-title"
            >
              {isUntrusted ? "Untrusted QR code" : "QR code rejected"}
            </Text>
            <Text
              accessibilityRole="alert"
              accessibilityLiveRegion="assertive"
              className={
                isUntrusted
                  ? "text-amber-700/80 dark:text-amber-300/80 text-sm mt-1 mb-4"
                  : "text-error/80 dark:text-red-300/80 text-sm mt-1 mb-4"
              }
              testID="access-scanner-error-message"
            >
              {scanError.message}
            </Text>
            <Button
              title="Scan Again"
              accessibilityRole="button"
              accessibilityLabel="Scan Again"
              onPress={handleScanAgain}
              variant="outline"
            />
          </Card>
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

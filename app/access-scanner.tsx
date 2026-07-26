import { View, Text, ActivityIndicator, AccessibilityInfo } from "react-native";
import React, { useRef, useState } from "react";
import { useRouter } from "expo-router";
import { CameraView, useCameraPermissions } from "expo-camera";
import type { BarcodeScanningResult } from "expo-camera";
import * as Linking from "expo-linking";
import { AppHeader } from "../src/components/AppHeader";
import { Button } from "../src/components/Button";
import { Card } from "../src/components/Card";
import { verifyAndParseAccessQrPayload, QrValidationResult } from "../src/features/access/verifyQrPayload";
import { describeQrSignatureError, QR_SIGNATURE_ERROR_CODES, QrSignatureErrorCode } from "../src/features/access/qrSignature";
import { describeQrPayloadError, QR_PAYLOAD_ERROR_CODES, QrPayloadErrorCode } from "../src/features/access/qrPayload";
import { AccessHistoryList } from "../src/components/AccessHistoryList";
import { useAccessHistoryStore } from "../src/features/access/accessHistory.store";

type AccessibleCameraViewProps = React.ComponentProps<typeof CameraView> & {
  accessibilityLabel?: string;
  accessibilityHint?: string;
  accessibilityLiveRegion?: "none" | "polite" | "assertive";
};

const AccessibleCameraView = CameraView as React.ComponentType<AccessibleCameraViewProps>;

export default function AccessScanner() {
  const router = useRouter();
  const [permission, requestPermission] = useCameraPermissions();
  const [scanError, setScanError] = useState<string | null>(null);
  const [isProcessingScan, setIsProcessingScan] = useState(false);
  const scanInProgressRef = useRef(false);
  const entries = useAccessHistoryStore((state) => state.entries);
  const clearHistory = useAccessHistoryStore((state) => state.clearHistory);

  const handleBarcodeScanned = async ({ data }: BarcodeScanningResult) => {
    if (scanInProgressRef.current) {
      return;
    }

    scanInProgressRef.current = true;
    setIsProcessingScan(true);
    setScanError(null);
    AccessibilityInfo.announceForAccessibility("Processing access QR code.");

    const result = await verifyAndParseAccessQrPayload(data);

    if (result.success) {
      AccessibilityInfo.announceForAccessibility("QR code accepted. Opening access check.");
      router.replace({ pathname: "/access-check", params: { qrPayload: data } });
      return;
    } else {
      let errorMessage = "Unable to read QR payload.";

      // Type guards based on keys in the constant objects
      if (Object.values(QR_SIGNATURE_ERROR_CODES).includes(result.reason as any)) {
        errorMessage = describeQrSignatureError(result.reason as QrSignatureErrorCode);
      } else if (Object.values(QR_PAYLOAD_ERROR_CODES).includes(result.reason as any)) {
        errorMessage = describeQrPayloadError(result.reason as QrPayloadErrorCode);
      }

      setScanError(errorMessage);
      AccessibilityInfo.announceForAccessibility(`QR code rejected. ${errorMessage}`);
      setIsProcessingScan(false);
      scanInProgressRef.current = false;
    }
  };

  const handleScanAgain = () => {
    scanInProgressRef.current = false;
    setScanError(null);
    setIsProcessingScan(false);
  };

  if (!permission) {
    return (
      <View className="flex-1 bg-background">
        <AppHeader title="Scan Access QR" showBack />
        <View className="flex-1 px-4 py-6">
          <Card>
            <Text accessibilityLiveRegion="polite" className="text-text-muted">Checking camera permission...</Text>
          </Card>
        </View>
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View className="flex-1 bg-background">
        <AppHeader title="Scan Access QR" showBack />
        <View className="flex-1 px-4 py-6">
          <Card>
            <Text accessibilityRole="header" className="text-xl font-bold text-text mb-2">Camera access needed</Text>
            <Text accessibilityLiveRegion="polite" className="text-text-muted mb-6">
              GuildPass needs camera permission to scan access check QR codes.
            </Text>
            {permission.canAskAgain ? (
              <Button title="Allow Camera Access" onPress={requestPermission} />
            ) : (
              <>
                <Text accessibilityRole="alert" accessibilityLiveRegion="assertive" className="text-error">
                  Camera permission was denied. Enable camera access in your device settings to scan
                  QR codes.
                </Text>
                <Text accessibilityRole="alert" accessibilityLiveRegion="assertive" className="text-error mb-6">
                  Camera permission was denied. Open Settings to enable camera access for GuildPass.
                </Text>
                <Button
                  title="Open Settings"
                  onPress={() => Linking.openSettings()}
                  variant="outline"
                />
              </>
            )}
          </Card>
        </View>
      </View>
    );
  }

  if (isProcessingScan) {
    return (
      <View accessibilityLabel="Processing access QR code" accessibilityState={{ busy: true }} className="flex-1 bg-background justify-center items-center">
        <AppHeader title="Scan Access QR" showBack />
        <ActivityIndicator size="large" accessibilityLabel="Processing access QR code" accessibilityLiveRegion="polite" />
        <Text accessibilityLiveRegion="polite" className="mt-4 text-text">Processing...</Text>
      </View>
    );
  }

  if (scanError) {
    return (
      <View className="flex-1 bg-background">
        <AppHeader title="Scan Access QR" showBack />
        <View className="flex-1 px-4 py-6">
          <Card className="border-error bg-error/5">
            <Text accessibilityRole="alert" accessibilityLiveRegion="assertive" className="text-error font-bold">QR code rejected</Text>
            <Text accessibilityRole="alert" accessibilityLiveRegion="assertive" className="text-error/80 text-sm mt-1 mb-4">{scanError}</Text>
            <Button title="Scan Again" onPress={handleScanAgain} variant="outline" />
          </Card>
        </View>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-background">
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
            <Text accessibilityLiveRegion="polite" className="text-text font-medium text-center">
              Point your camera at a GuildPass access QR code.
            </Text>
          </Card>
          <AccessHistoryList entries={entries} onClear={clearHistory} />
        </View>
        
        {__DEV__ && (
          <View className="absolute top-4 right-4">
            <Button
              title="Test: Fail Scan"
              accessibilityLabel="test-fail-scan"
              onPress={() => {
                setScanError("This QR code has expired.");
                setIsProcessingScan(false);
                scanInProgressRef.current = true;
              }}
            />
          </View>
        )}
      </View>
    </View>
  );
}

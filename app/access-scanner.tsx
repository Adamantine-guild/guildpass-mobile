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
import { describeQrSignatureError, QR_SIGNATURE_ERROR_CODES, QrSignatureErrorCode, QrSignatureError } from "../src/features/access/qrSignature";
import { describeQrPayloadError, QR_PAYLOAD_ERROR_CODES, QrPayloadErrorCode, QrPayloadError } from "../src/features/access/qrPayload";
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
  const [scanError, setScanError] = useState<{ message: string; isUntrusted: boolean } | null>(null);
  const [isProcessingScan, setIsProcessingScan] = useState(false);
  const [verificationSuccess, setVerificationSuccess] = useState(false);
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

    try {
      AccessibilityInfo.announceForAccessibility("Processing access QR code.");
      const result = await verifyAndParseAccessQrPayload(data);
      setVerificationSuccess(true);
      AccessibilityInfo.announceForAccessibility("QR code accepted. Opening access check.");
      
      setTimeout(() => {
        setVerificationSuccess(false);
        router.replace({ pathname: "/access-check", params: { qrPayload: data } });
      }, 1500);
      return;
    } catch (error) {
      let errorMessage = "Unable to read QR payload.";
      let isUntrusted = false;

      if (error instanceof QrSignatureError) {
        errorMessage = describeQrSignatureError(error.code);
        isUntrusted = true;
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
      }

      setScanError({ message: errorMessage, isUntrusted });
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
            <Text accessibilityRole="header" className="text-xl font-bold text-text mb-2">
              {permission.status === "denied" ? "Camera permission denied" : "Camera access needed"}
            </Text>
            
            {permission.status === "denied" ? (
              <Text accessibilityRole="alert" accessibilityLiveRegion="assertive" className="text-error mb-6">
                {permission.canAskAgain
                  ? "Camera permission was denied. Please allow camera access to scan QR codes."
                  : "Camera permission was permanently denied. Open Settings to enable camera access for GuildPass to scan QR codes."}
              </Text>
            ) : (
              <Text accessibilityLiveRegion="polite" className="text-text-muted mb-6">
                GuildPass needs camera permission to scan access check QR codes.
              </Text>
            )}

            {permission.canAskAgain ? (
              <Button title="Allow Camera Access" onPress={requestPermission} />
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
      <View accessibilityLabel="Processing access QR code" accessibilityState={{ busy: true }} className="flex-1 bg-background justify-center items-center">
        <AppHeader title="Scan Access QR" showBack />
        <ActivityIndicator size="large" accessibilityLabel="Processing access QR code" accessibilityLiveRegion="polite" />
        <Text accessibilityLiveRegion="polite" className="mt-4 text-text">Processing...</Text>
      </View>
    );
  }

  if (verificationSuccess) {
    return (
      <View accessibilityLabel="Signature verified" accessibilityState={{ busy: true }} className="flex-1 bg-background justify-center items-center">
        <AppHeader title="Scan Access QR" showBack />
        <View className="flex-1 px-4 py-6 justify-center w-full">
          <Card className="border-success bg-success/5 items-center py-8">
            <Text className="text-success text-4xl mb-4 font-bold">✓</Text>
            <Text className="text-success font-bold text-xl">Signature verified</Text>
            <Text className="text-success/80 mt-2 text-center">Redirecting to access check...</Text>
          </Card>
        </View>
      </View>
    );
  }

  if (scanError) {
    const isUntrusted = scanError.isUntrusted;
    return (
      <View className="flex-1 bg-background">
        <AppHeader title="Scan Access QR" showBack />
        <View className="flex-1 px-4 py-6">
          <Card className={isUntrusted ? "border-amber-500 bg-amber-500/10" : "border-error bg-error/5"}>
            <Text accessibilityRole="alert" accessibilityLiveRegion="assertive" className={isUntrusted ? "text-amber-600 font-bold text-lg" : "text-error font-bold text-lg"}>
              {isUntrusted ? "Untrusted QR code" : "QR code rejected"}
            </Text>
            <Text accessibilityRole="alert" accessibilityLiveRegion="assertive" className={isUntrusted ? "text-amber-700/80 text-sm mt-1 mb-4" : "text-error/80 text-sm mt-1 mb-4"}>
              {scanError.message}
            </Text>
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

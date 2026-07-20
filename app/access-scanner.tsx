import { View, Text, ActivityIndicator } from "react-native";
import React, { useRef, useState } from "react";
import { useRouter } from "expo-router";
import { CameraView, useCameraPermissions } from "expo-camera/next";
import type { BarcodeScanningResult } from "expo-camera/next";
import { CameraView, useCameraPermissions } from "expo-camera";
import type { BarcodeScanningResult } from "expo-camera";
import * as Linking from "expo-linking";
import { AppHeader } from "../src/components/AppHeader";
import { Button } from "../src/components/Button";
import { Card } from "../src/components/Card";
import { verifyAndParseAccessQrPayload } from "../src/features/access/verifyQrPayload";
import { QrSignatureError } from "../src/features/access/qrSignature";
import { QrPayloadError, QR_PAYLOAD_ERROR_CODES } from "../src/features/access/qrPayload";
import { AccessHistoryList } from "../src/components/AccessHistoryList";
import { useAccessHistoryStore } from "../src/features/access/accessHistory.store";

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

    try {
      await verifyAndParseAccessQrPayload(data);
      router.replace({ pathname: "/access-check", params: { qrPayload: data } });
    } catch (scanError) {
      if (scanError instanceof QrSignatureError) {
        setScanError("QR code signature is invalid or missing.");
      } else if (
        scanError instanceof QrPayloadError &&
        scanError.code === QR_PAYLOAD_ERROR_CODES.ALREADY_USED
      ) {
        setScanError("This QR code has already been used.");
      } else {
        setScanError("Unable to read QR payload.");
      }
      setIsProcessingScan(false);
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
            <Text className="text-text-muted">Checking camera permission...</Text>
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
            <Text className="text-xl font-bold text-text mb-2">Camera access needed</Text>
            <Text className="text-text-muted mb-6">
              GuildPass needs camera permission to scan access check QR codes.
            </Text>
            {permission.canAskAgain ? (
              <Button title="Allow Camera Access" onPress={requestPermission} />
            ) : (
              <Text className="text-error">
                Camera permission was denied. Enable camera access in your device settings to scan
                QR codes.
              </Text>
              <>
                <Text className="text-error mb-6">
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
      <View className="flex-1 bg-background justify-center items-center">
        <AppHeader title="Scan Access QR" showBack />
        <ActivityIndicator size="large" />
        <Text className="mt-4 text-text">Processing...</Text>
      </View>
    );
  }

  if (scanError) {
    return (
      <View className="flex-1 bg-background">
        <AppHeader title="Scan Access QR" showBack />
        <View className="flex-1 px-4 py-6">
          <Card className="border-error bg-error/5">
            <Text className="text-error font-bold">QR code rejected</Text>
            <Text className="text-error/80 text-sm mt-1 mb-4">{scanError}</Text>
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
        <CameraView
          style={{ flex: 1 }}
          facing="back"
          onBarcodeScanned={handleBarcodeScanned}
          barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
        />
        <View className="absolute left-4 right-4 bottom-4">
          <Card className="mb-4">
            <Text className="text-text font-medium text-center">
              Point your camera at a GuildPass access QR code.
            </Text>
          </Card>
          <AccessHistoryList entries={entries} onClear={clearHistory} />
        </View>
      </View>
    </View>
  );
}

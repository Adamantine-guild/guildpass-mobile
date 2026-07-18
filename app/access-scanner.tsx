import { View, Text } from "react-native";
import React, { useState } from "react";
import { useRouter } from "expo-router";
import { CameraView, useCameraPermissions } from "expo-camera";
import type { BarcodeScanningResult } from "expo-camera";
import { AppHeader } from "../src/components/AppHeader";
import { Button } from "../src/components/Button";
import { Card } from "../src/components/Card";
import { verifyAndParseAccessQrPayload } from "../src/features/access/verifyQrPayload";
import { QrSignatureError } from "../src/features/access/qrSignature";

export default function AccessScanner() {
  const router = useRouter();
  const [permission, requestPermission] = useCameraPermissions();
  const [hasScanned, setHasScanned] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleBarcodeScanned = async ({ data }: BarcodeScanningResult) => {
    if (hasScanned) {
      return;
    }

    setHasScanned(true);

    try {
      // Structural parse first (fast, sync). When the qrSignatureVerification
      // feature flag is on, this also cryptographically verifies the payload
      // against the guild's published issuer key and rejects forged QR codes.
      await verifyAndParseAccessQrPayload(data);
      router.replace({
        pathname: "/access-check",
        params: { qrPayload: data },
      });
    } catch (scanError) {
      const message =
        scanError instanceof QrSignatureError
          ? "QR code signature is invalid or missing."
          : scanError instanceof Error
            ? scanError.message
            : "Unable to read QR payload.";
      setError(message);
    }
  };

  const resetScanner = () => {
    setError(null);
    setHasScanned(false);
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
            )}
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
          onBarcodeScanned={hasScanned ? undefined : handleBarcodeScanned}
          barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
        />

        <View className="absolute left-4 right-4 bottom-8">
          <Card className={error ? "border-error bg-error/5" : ""}>
            {error ? (
              <>
                <Text className="text-error font-bold">QR code rejected</Text>
                <Text className="text-error/80 text-sm mt-1 mb-4">{error}</Text>
                <Button title="Scan Again" onPress={resetScanner} variant="outline" />
              </>
            ) : (
              <Text className="text-text font-medium text-center">
                Point your camera at a GuildPass access QR code.
              </Text>
            )}
          </Card>
        </View>
      </View>
    </View>
  );
}

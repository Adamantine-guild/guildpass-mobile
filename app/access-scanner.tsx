import { View, Text } from "react-native";
import React, { useState } from "react";
import { useRouter } from "expo-router";
import { useCameraPermissions } from "expo-camera";
// eslint-disable-next-line import/no-unresolved
import { BarCodeScanningResult, Camera, CameraType } from "expo-camera/legacy";
import { AppHeader } from "../src/components/AppHeader";
import { Button } from "../src/components/Button";
import { Card } from "../src/components/Card";
import { parseAccessQrPayload } from "../src/features/access/qrPayload";

export default function AccessScanner() {
  const router = useRouter();
  const [permission, requestPermission] = useCameraPermissions();
  const [hasScanned, setHasScanned] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleBarcodeScanned = ({ data }: BarCodeScanningResult) => {
    if (hasScanned) {
      return;
    }

    setHasScanned(true);

    try {
      parseAccessQrPayload(data);
      router.replace({
        pathname: "/access-check",
        params: { qrPayload: data },
      });
    } catch (scanError) {
      setError(scanError instanceof Error ? scanError.message : "Unable to read QR payload.");
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
        <Camera
          style={{ flex: 1 }}
          type={CameraType.back}
          onBarCodeScanned={hasScanned ? undefined : handleBarcodeScanned}
          barCodeScannerSettings={{ barCodeTypes: ["qr"] }}
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

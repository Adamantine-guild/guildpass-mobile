import { View, Text, ActivityIndicator } from "react-native";
import React, { useState, useEffect } from "react";
import { useRouter } from "expo-router";
import { CameraView, useCameraPermissions } from "expo-camera";
import type { BarcodeScanningResult } from "expo-camera";
import * as Linking from "expo-linking";
import { AppHeader } from "../src/components/AppHeader";
import { Button } from "../src/components/Button";
import { Card } from "../src/components/Card";
import { parseAccessQrPayload } from "../src/features/access/qrPayload";
import { useAccessCheck } from "../src/features/access/useAccessCheck";
import { verifyAndParseAccessQrPayload } from "../src/features/access/verifyQrPayload";
import { QrSignatureError } from "../src/features/access/qrSignature";

export default function AccessScanner() {
  const router = useRouter();
  const [permission, requestPermission] = useCameraPermissions();
  const { state, startScan, checkAccess, reset } = useAccessCheck();
  const [qrData, setQrData] = useState<string | null>(null);

  // Kick off scanning when camera permission granted and we are idle
  useEffect(() => {
    if (permission?.granted && state.status === "idle") {
      startScan();
  const handleBarcodeScanned = async ({ data }: BarcodeScanningResult) => {
    if (hasScanned) {
      return;
    }
  }, [permission, state.status, startScan]);

  // Navigate to result page on successful access check
  useEffect(() => {
    if (state.status === "success" && qrData) {
      router.replace({ pathname: "/access-check", params: { qrPayload: qrData } });
    }
  }, [state.status, qrData, router]);

  const handleBarcodeScanned = ({ data }: BarcodeScanningResult) => {
    if (state.status !== "idle") return;
    try {
      const parsed = parseAccessQrPayload(data);
      setQrData(data);
      // Build params for access check API
      const params = {
        guildId: parsed.guildId,
        resourceId: parsed.resourceId,
        walletAddress: parsed.walletAddress ?? "",
      };
      checkAccess(params);
    } catch (e) {
      const message = e instanceof Error ? e.message : "Unable to read QR payload.";
      // Directly transition to error state
      // Since reducer does not have a VALIDATION_ERROR action, we use reset then dispatch error via custom action
      // For simplicity, we call reset and set a custom error via dispatch
      // (dispatch is not exposed here, but we rely on error handling in useAccessCheck via reset and later UI)
      // Instead, we can simply set a local error state – but to keep pattern, we'll call reset and let UI show generic error.
      reset();
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

  // Loading / processing UI
  if (state.status === "scanning" || state.status === "submitting") {
    return (
      <View className="flex-1 bg-background justify-center items-center">
        <AppHeader title="Scan Access QR" showBack />
        <ActivityIndicator size="large" />
        <Text className="mt-4 text-text">Processing...</Text>
      </View>
    );
  }

  // Error UI
  if (state.status === "error") {
    return (
      <View className="flex-1 bg-background">
        <AppHeader title="Scan Access QR" showBack />
        <View className="flex-1 px-4 py-6">
          <Card className="border-error bg-error/5">
            <Text className="text-error font-bold">QR code rejected</Text>
            <Text className="text-error/80 text-sm mt-1 mb-4">{state.error}</Text>
            <Button title="Scan Again" onPress={reset} variant="outline" />
          </Card>
        </View>
      </View>
    );
  }

  // Main scanner UI (idle state)
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
        <View className="absolute left-4 right-4 bottom-8">
          <Card>
            <Text className="text-text font-medium text-center">
              Point your camera at a GuildPass access QR code.
            </Text>
          </Card>
        </View>
      </View>
    </BiometricGate>
  );
}

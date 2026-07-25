/**
 * Local type declaration for expo-camera.
 *
 * expo-camera v14 exports Camera and BarCodeScanningResult. This shim provides
 * CameraView and BarcodeScanningResult aliases so newer Expo 51+ code patterns
 * typecheck cleanly without modifying runtime imports.
 */

declare module "expo-camera" {
  import * as React from "react";

  export interface BarCodeScanningResult {
    type: string;
    data: string;
    bounds?: {
      origin: { x: number; y: number };
      size: { width: number; height: number };
    };
    cornerPoints?: { x: number; y: number }[];
  }

  export type BarcodeScanningResult = BarCodeScanningResult;

  export interface CameraPermissionResponse {
    granted: boolean;
    canAskAgain: boolean;
    status: "granted" | "denied" | "undetermined";
    expires: "never" | number;
  }

  export interface CameraViewProps {
    style?: any;
    facing?: "front" | "back";
    onBarcodeScanned?: (result: BarcodeScanningResult) => void;
    onBarCodeScanned?: (result: BarCodeScanningResult) => void;
    barcodeScannerSettings?: {
      barcodeTypes?: string[];
    };
    barCodeScannerSettings?: {
      barCodeTypes?: string[];
    };
    children?: React.ReactNode;
  }

  export class Camera extends React.Component<CameraViewProps> {}
  export class CameraView extends React.Component<CameraViewProps> {}

  export function useCameraPermissions(): [
    CameraPermissionResponse | null,
    () => Promise<CameraPermissionResponse>,
    () => Promise<CameraPermissionResponse>,
  ];
}

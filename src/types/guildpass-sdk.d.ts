declare module "@guildpass/sdk" {
  export interface GuildPassClientOptions {
    apiUrl: string;
    chainId: number;
  }

  export class GuildPassClient {
    constructor(options: GuildPassClientOptions);
    guilds: {
      getGuild(params: { guildId: string }): Promise<any>;
      getGuildConfig(params: { guildId: string }): Promise<{
        guildId: string;
        requiredRoles?: string[];
        accessPolicy?: "any" | "all";
        /** Hex-encoded secp256k1 public key used to sign QR access payloads. */
        issuerPublicKey?: string;
        [key: string]: unknown;
      }>;
    };
    roles: {
      getRoles(params: { guildId: string }): Promise<any>;
      getUserRoles(params: { walletAddress: string; guildId: string }): Promise<any>;
    };
    membership: {
      getMembership(params: { walletAddress: string; guildId: string }): Promise<any>;
    };
    access: {
      checkAccess(params: { walletAddress: string; guildId: string; resourceId: string }): Promise<any>;
    };
  }
}

declare module "expo-camera" {
  export function useCameraPermissions(options?: any): any;
}

declare module "expo-camera/legacy" {
  import * as React from "react";
  export class Camera extends React.Component<any, any> {}
  export enum CameraType {
    back = "back",
    front = "front"
  }
  export interface BarCodeScanningResult {
    type: string;
    data: string;
  }
}

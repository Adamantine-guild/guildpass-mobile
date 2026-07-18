declare module "@guildpass/sdk" {
  export interface GuildPassClientOptions {
    apiUrl: string;
    chainId: number;
    /**
     * Optional fetch-compatible transport used by the authed client. The mobile
     * app injects an authenticated fetch (see `src/features/auth/authFetch.ts`)
     * that attaches the session bearer token and handles 401 → refresh.
     */
    fetch?: (input: string | URL | Request, init?: RequestInit) => Promise<Response>;
  }

  // ---------------------------------------------------------------------------
  // Auth namespace (SIWE token exchange)
  //
  // Declared here as the contract the SDK is expected to own once it ships SIWE
  // support. The mobile app currently implements the same shape in
  // `src/features/auth/authClient.ts` (mirrored by AuthClient); swapping to the
  // SDK later is a drop-in. See docs/siwe-session-architecture.md.
  // ---------------------------------------------------------------------------

  export interface NonceResponse {
    nonce: string;
  }

  export interface SiweExchangeParams {
    message: string;
    signature: string;
  }

  export interface RefreshParams {
    refreshToken: string;
  }

  export interface RevokeParams {
    refreshToken: string;
  }

  export interface TokenPair {
    accessToken: string;
    refreshToken: string;
    accessExpiresAt: number;
    refreshExpiresAt?: number;
  }

  export interface AuthService {
    getNonce(): Promise<NonceResponse>;
    exchangeSiwe(params: SiweExchangeParams): Promise<TokenPair>;
    refresh(params: RefreshParams): Promise<TokenPair>;
    revoke(params: RevokeParams): Promise<void>;
  }

  export class GuildPassClient {
    constructor(options: GuildPassClientOptions);
    auth: AuthService;
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
  export const CameraView: any;
  export interface BarcodeScanningResult {
    type: string;
    data: string;
  }
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

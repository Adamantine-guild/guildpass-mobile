import { z } from "zod";
import Constants from "expo-constants";

const AppEnvSchema = z.enum(["development", "preview", "production"]).default("development");

// Feature flags are opt-in via environment variables so rollout can be staged
// per environment (development → preview → production) without a code change or
// app store resubmission. They default to OFF (false) unless explicitly set to
// "true" / "1" / "yes".
const FeatureFlagSchema = z
  .enum(["true", "false", "1", "0", "yes", "no"])
  .default("false")
  .transform((value) => value === "true" || value === "1" || value === "yes");

const ConfigSchema = z.object({
  apiUrl: z.string().url("EXPO_PUBLIC_API_URL must be a valid URL"),
  chainId: z.coerce.number().finite("EXPO_PUBLIC_CHAIN_ID must be a finite number"),
  appEnv: AppEnvSchema,
  walletConnectProjectId: z.string().optional(),
  privyAppId: z.string().min(1).optional(),
  privyClientId: z.string().min(1).optional(),
  // When ON, QR payloads without a valid signature are rejected. During the
  // migration window this stays OFF so legacy unsigned payloads keep working.
  qrSignatureVerification: FeatureFlagSchema,
  // The threshold duration (in ms) after which foregrounding the app will trigger
  // invalidation and background refetching of relevant membership/role queries.
  foregroundRefetchThresholdMs: z.coerce.number().finite().default(120000),
});

export type AppConfig = z.infer<typeof ConfigSchema>;

export function loadConfig(): AppConfig {
  const rawConfig = {
    apiUrl: Constants.expoConfig?.extra?.apiUrl ?? process.env.EXPO_PUBLIC_API_URL,
    chainId: Constants.expoConfig?.extra?.chainId ?? process.env.EXPO_PUBLIC_CHAIN_ID,
    appEnv: Constants.expoConfig?.extra?.appEnv ?? process.env.EXPO_PUBLIC_APP_ENV,
    walletConnectProjectId:
      Constants.expoConfig?.extra?.walletConnectProjectId ??
      process.env.EXPO_PUBLIC_WALLET_CONNECT_PROJECT_ID,
    privyAppId: Constants.expoConfig?.extra?.privyAppId ?? process.env.EXPO_PUBLIC_PRIVY_APP_ID,
    privyClientId:
      Constants.expoConfig?.extra?.privyClientId ?? process.env.EXPO_PUBLIC_PRIVY_CLIENT_ID,
    qrSignatureVerification:
      Constants.expoConfig?.extra?.qrSignatureVerification ??
      process.env.EXPO_PUBLIC_QR_SIGNATURE_VERIFICATION,
    foregroundRefetchThresholdMs:
      Constants.expoConfig?.extra?.foregroundRefetchThresholdMs ??
      process.env.EXPO_PUBLIC_FOREGROUND_REFETCH_THRESHOLD_MS,
  };

  const parsed = ConfigSchema.safeParse(rawConfig);

  if (!parsed.success) {
    const errorMessages = parsed.error.issues
      .map((i) => `${i.path.join(".")}: ${i.message}`)
      .join("\n");
    throw new Error(`Invalid application configuration:\n${errorMessages}`);
  }

  return parsed.data;
}

export const appConfig = loadConfig();

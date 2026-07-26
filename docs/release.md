# Release Guide

This document describes the build profiles, environment expectations, and preflight checks for releasing GuildPass Mobile.

---

## Build Profiles

### Development

| Property           | Value                           |
| ------------------ | ------------------------------- |
| Channel            | `development`                   |
| Distribution       | Internal (Expo Go / dev client) |
| iOS Config         | Debug                           |
| Android Build Type | APK                             |
| API URL            | `http://localhost:3000`         |
| Chain ID           | `11155111` (Sepolia)            |
| App Env            | `development`                   |

**Purpose**: Local development and testing on physical devices via Expo Go or a development build.

**Usage**:

```bash
eas build --profile development --platform all
```

---

### Preview

| Property           | Value                                  |
| ------------------ | -------------------------------------- |
| Channel            | `preview`                              |
| Distribution       | Internal (TestFlight / Internal Track) |
| iOS Config         | Release                                |
| Android Build Type | App Bundle (AAB)                       |
| API URL            | `https://staging.guildpass.xyz`        |
| Chain ID           | `11155111` (Sepolia)                   |
| App Env            | `preview`                              |

**Purpose**: Share with testers and stakeholders for QA before production release.

**Usage**:

```bash
eas build --profile preview --platform all
eas submit --profile preview --platform ios   # TestFlight
eas submit --profile preview --platform android
```

---

### Production

| Property           | Value                          |
| ------------------ | ------------------------------ |
| Channel            | `production`                   |
| Distribution       | Store (App Store / Play Store) |
| iOS Config         | Release                        |
| Android Build Type | App Bundle (AAB)               |
| API URL            | `https://api.guildpass.xyz`    |
| Chain ID           | `1` (Ethereum Mainnet)         |
| App Env            | `production`                   |

**Purpose**: Public release to the App Store and Google Play Store.

**Usage**:

```bash
eas build --profile production --platform all
eas submit --profile production --platform ios
eas submit --profile production --platform android
```

---

## Environment Matrix

| Variable                                | Development             | Preview                         | Production                  |
| --------------------------------------- | ----------------------- | ------------------------------- | --------------------------- |
| `EXPO_PUBLIC_API_URL`                   | `http://localhost:3000` | `https://staging.guildpass.xyz` | `https://api.guildpass.xyz` |
| `EXPO_PUBLIC_CHAIN_ID`                  | `11155111`              | `11155111`                      | `1`                         |
| `EXPO_PUBLIC_APP_ENV`                   | `development`           | `preview`                       | `production`                |
| `EXPO_PUBLIC_WALLET_CONNECT_PROJECT_ID` | (optional - local only) | (set in EAS Secrets)            | (set in EAS Secrets)        |

> Environment variables prefixed with `EXPO_PUBLIC_` are exposed to the client. Sensitive values (API keys, service accounts) must be configured as **EAS Secrets** — never in `.env` files committed to the repository.

---

## Required Secrets

These must be configured in the [EAS dashboard](https://expo.dev/accounts/*/projects/guildpass-mobile/secrets) or your CI/CD provider:

| Secret                                  | Purpose                                        |
| --------------------------------------- | ---------------------------------------------- |
| `EXPO_TOKEN`                            | EAS API token for CI/CD authentication         |
| `EXPO_PUBLIC_WALLET_CONNECT_PROJECT_ID` | WalletConnect v2 project ID (production)       |
| `APPLE_APP_SPECIFIC_PASSWORD`           | App Store Connect app-specific password        |
| `GCP_SERVICE_ACCOUNT_KEY`               | Google Play Console service account key (JSON) |

---

## Preflight Checklist

Before cutting a release, run through each item:

### 1. Code Quality

- [ ] `pnpm typecheck` passes with zero errors
- [ ] `pnpm lint` passes with zero warnings
- [ ] `pnpm test:run` — all tests green
- [ ] `pnpm format` has been run (no unformatted files)

### 2. Environment & Config

- [ ] `.env.example` is up to date with any new variables
- [ ] All required EAS Secrets are set in the Expo dashboard
- [ ] EAS project ID in `app.json` matches the Expo project
- [ ] `runtimeVersion` policy is correct in `app.json`
- [ ] `version` in `app.json` and `package.json` are bumped appropriately

### 3. Build & Submit

- [ ] **Preview build** completes successfully on both platforms
- [ ] Smoke-test the preview build on physical devices (iOS + Android)
- [ ] Verify deep links (`guildpass://`) work correctly
- [ ] Verify API connectivity with the target environment
- [ ] Staging `.env` values match the target preview environment
- [ ] Production `.env` values match the target production environment
- [ ] App icons and splash screen assets are final
- [ ] Privacy policy and terms URLs are correct in App Store / Play Store listing

### 4. Release

- [ ] Release notes / changelog are prepared
- [ ] App Store Connect / Google Play Console listing is up to date
- [ ] Version code (Android) and build number (iOS) are incremented
- [ ] Production build submitted and approved

---

## Versioning Strategy

- **Semantic Versioning** (`major.minor.patch`) in `app.json` / `package.json`
- iOS `buildNumber` and Android `versionCode` auto-increment via EAS (configure `"autoIncrement": true` in `eas.json` if desired)
- Align `runtimeVersion` policy with `appVersion` so OTA updates are delivered per version

---

## OTA Updates (EAS Update)

OTA updates are delivered through the channel matching the build profile:

| Channel       | Audience         |
| ------------- | ---------------- |
| `development` | Developers       |
| `preview`     | Internal testers |
| `production`  | All users        |

Publish an update:

```bash
eas update --branch preview --message "fix: resolve login crash"
```

Updates are scoped to the `runtimeVersion` — any native code change requires a new store build.

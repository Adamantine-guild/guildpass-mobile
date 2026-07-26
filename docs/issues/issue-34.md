# Issue #34 — Define Expo / EAS Release Profiles

## Summary

This PR introduces explicit build profiles for development, preview, and production in `eas.json`, updates `app.json` with consistent metadata, documents all required environment variables, adds a CI/CD workflow, and provides a comprehensive release guide with preflight checks.

## Changes Made

### `eas.json` (new)

Three EAS Build profiles:

- **development** — Debug config, APK output, local API, Sepolia chain, `development` channel
- **preview** — Release config, AAB output, staging API, Sepolia chain, `preview` channel, internal distribution
- **production** — Release config, AAB output, production API, Mainnet chain, `production` channel, store submission

Includes a `submit.production` block with placeholder credentials.

### `app.json` (updated)

- Added `scheme: "guildpass"` for consistent deep linking
- Added `ios.infoPlist.CFBundleDisplayName` — display name matches across profiles
- Added `android.intentFilters` for deep link verification
- Added `runtimeVersion` with `appVersion` policy for OTA update scoping
- Added `updates` block (URL, enabled, checkAutomatically, fallbackToCacheTimeout)
- Added `expo-updates` to the plugins array

### `package.json` (updated)

- Added `expo-updates` dependency for OTA update support in builds

### `.env.example` (new)

Documents the three required environment variables (`EXPO_PUBLIC_API_URL`, `EXPO_PUBLIC_CHAIN_ID`, `EXPO_PUBLIC_APP_ENV`) and one optional (`EXPO_PUBLIC_WALLET_CONNECT_PROJECT_ID`).

### `.github/workflows/eas-build.yml` (new)

- Dual-job workflow: **validate** (typecheck, lint, test) then **build** (EAS Build)
- Triggers on push/PR to main/develop and via `workflow_dispatch` with profile selection
- Uploads development build APK/IPA as CI artifacts

### `docs/release.md` (new)

Full release documentation including:

- Build profile reference tables with purpose and usage
- Environment variable matrix across all three profiles
- Required EAS Secrets documentation (placeholder values only)
- Preflight checklist covering code quality, config, build/submit, and release
- Versioning strategy and OTA update instructions

### `README.md` (updated)

Added a **Build & Release** section with a profile summary table, commands, and pointer to `docs/release.md`.

## Acceptance Criteria Met

- [x] Development build profile is documented
- [x] Preview build profile is documented
- [x] Production build profile is documented
- [x] Each profile has clear environment expectations
- [x] App metadata is consistent across build targets
- [x] Release documentation includes preflight checks

## Notes

- No real credentials included — all secrets use placeholder values
- EAS project ID should be replaced with the real value before first build
- WalletConnect project ID, Apple credentials, and GCP service account key must be set as EAS Secrets

Closes #34

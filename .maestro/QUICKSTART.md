# Maestro E2E Quick Start

Get up and running with E2E tests in 5 minutes.

## Prerequisites

- ✅ Node.js 18+ installed
- ✅ iOS Simulator (macOS) or Android Emulator set up
- ✅ GuildPass Mobile repository cloned

## Setup (One-time)

### 1. Install Maestro

**macOS/Linux:**

```bash
curl -Ls "https://get.maestro.mobile.dev" | bash
```

**Windows (WSL):**

```bash
wsl
curl -Ls "https://get.maestro.mobile.dev" | bash
```

Restart your terminal and verify:

```bash
maestro --version
```

### 2. Install Project Dependencies

```bash
cd guildpass-mobile
npm install
```

## Running Tests

### Option A: Quick Test (Recommended for First Run)

```bash
# 1. Build and launch the app
npx expo run:ios
# or: npx expo run:android

# 2. In a new terminal, run a single test
maestro test .maestro/01-onboarding-to-profile.yaml
```

### Option B: Full Test Suite

```bash
# 1. Build and launch the app
npx expo run:ios

# 2. In a new terminal, start dev server
npm start

# 3. In another terminal, run all tests
npm run test:e2e
```

### Option C: Interactive Mode (Best for Debugging)

```bash
# 1. Build and launch the app
npx expo run:ios

# 2. Open Maestro Studio
npm run test:e2e:studio

# 3. Load a test flow and run step-by-step
```

## Test Files

| Test                | What It Does                   | File                            |
| ------------------- | ------------------------------ | ------------------------------- |
| 1️⃣ Onboarding       | App launch → Profile screen    | `01-onboarding-to-profile.yaml` |
| 2️⃣ Wallet Entry     | Enter wallet address           | `02-wallet-entry.yaml`          |
| 3️⃣ Guild Navigation | Browse guilds and details      | `03-guild-navigation.yaml`      |
| 4️⃣ Access Check ✅  | Successful access verification | `04-access-check-success.yaml`  |
| 5️⃣ Access Check ❌  | Failed access verification     | `05-access-check-failure.yaml`  |
| 6️⃣ Reset State      | Clear app data                 | `06-reset-app-state.yaml`       |

## Common Issues

### "App not found"

```bash
# Rebuild the app
npx expo run:ios --device
```

### "Element not found"

```bash
# Open Maestro Studio to debug
maestro studio
```

### "Simulator not booting"

```bash
# iOS
xcrun simctl boot "iPhone 15"

# Android
emulator @Pixel_6_API_33
```

## Next Steps

- 📖 Read [full E2E guide](../docs/e2e-testing-guide.md)
- 🔧 Learn [how to write tests](README.md#writing-tests)
- 🤝 [Contributing guidelines](../CONTRIBUTING.md)

## Need Help?

- Check [README.md](README.md) for detailed docs
- Review [troubleshooting guide](../docs/e2e-testing-guide.md#troubleshooting)
- Open an issue on GitHub

---

**Time to first test**: ~5 minutes ⚡

# GuildPass Mobile E2E Tests

This directory contains end-to-end tests for GuildPass Mobile using [Maestro](https://maestro.mobile.dev/), an Expo-compatible mobile UI testing framework.

## Test Coverage

### 01. Onboarding to Profile Navigation

- ✅ Validates onboarding screen display
- ✅ Tests navigation to profile screen
- **File**: `01-onboarding-to-profile.yaml`

### 02. Manual Wallet Entry

- ✅ Tests manual wallet address input
- ✅ Validates wallet connection flow
- ✅ Confirms connected state display
- **File**: `02-wallet-entry.yaml`

### 03. Guild List and Detail Navigation

- ✅ Tests navigation to guilds list
- ✅ Validates guild card display
- ✅ Tests guild detail navigation
- ✅ Confirms membership status display
- **File**: `03-guild-navigation.yaml`

### 04. Access Check Success Path

- ✅ Tests successful access check flow
- ✅ Validates form input and submission
- ✅ Confirms success result display
- **File**: `04-access-check-success.yaml`
- **Note**: Requires mock API to return success response

### 05. Access Check Failure Path

- ✅ Tests failed access check flow
- ✅ Validates error handling
- ✅ Confirms error message display
- **File**: `05-access-check-failure.yaml`
- **Note**: Requires mock API to return error response

### 06. Reset App State

- ✅ Tests settings navigation
- ✅ Validates reset functionality
- ✅ Confirms app returns to disconnected state
- **File**: `06-reset-app-state.yaml`

### 08. Social/email embedded wallet entry

- âœ… Verifies the configured social/email onboarding branch and its email input
- **File**: `08-embedded-wallet-entry.yaml`
- **Note**: Run this flow explicitly against a development build configured with
  `EXPO_PUBLIC_PRIVY_APP_ID` and `EXPO_PUBLIC_PRIVY_CLIENT_ID`. It is excluded
  from the default suite because OTP sign-in requires a real provider account.

## Prerequisites

### Install Maestro

**macOS/Linux:**

```bash
curl -Ls "https://get.maestro.mobile.dev" | bash
```

**Windows:**

```powershell
# Using WSL (recommended)
wsl
curl -Ls "https://get.maestro.mobile.dev" | bash
```

Verify installation:

```bash
maestro --version
```

### Setup Simulator/Emulator

**iOS Simulator:**

```bash
# Install Xcode from App Store
# Open Xcode and install iOS Simulator
xcrun simctl list devices
```

**Android Emulator:**

```bash
# Install Android Studio
# Create an AVD (Android Virtual Device)
# Start emulator
emulator -list-avds
emulator @your_avd_name
```

## Running E2E Tests

### 1. Build the Expo App for Testing

**Development Build (recommended for E2E testing):**

```bash
# iOS
npx expo run:ios

# Android
npx expo run:android
```

The app will be installed on the simulator/emulator with the bundle ID `xyz.guildpass.mobile`.

### 2. Start the Development Server

In a separate terminal:

```bash
pnpm start
```

### 3. Run All E2E Tests

```bash
# Run all flows
maestro test .maestro/

# Run specific flow
maestro test .maestro/01-onboarding-to-profile.yaml

# Run with recording
maestro test --format junit --output test-results .maestro/
```

### 4. Interactive Mode (Debugging)

```bash
# Open Maestro Studio for interactive testing
maestro studio
```

## Test ID Convention

Test IDs follow this naming convention:

- Screens: `{screen-name}-screen` (e.g., `onboarding-screen`)
- Buttons: `{action}-button` (e.g., `wallet-connect-button`)
- Inputs: `{field-name}-input` (e.g., `wallet-address-input`)
- Navigation: `navigate-{destination}-button`
- Results: `{feature}-result` or `{feature}-error`

## Network Mocking

For tests that depend on API responses (access checks), you can:

1. **Use environment variables** to switch between mock and real API:

   ```yaml
   env:
     MOCK_API_SUCCESS: true
   ```

2. **Set up a local mock server** using tools like:
   - [MSW (Mock Service Worker)](https://mswjs.io/)
   - [json-server](https://github.com/typicode/json-server)
   - [WireMock](http://wiremock.org/)

3. **Configure mock endpoint** in `.env.test`:
   ```
   EXPO_PUBLIC_API_URL=http://localhost:3000
   ```

## CI/CD Integration

### GitHub Actions Example

See `.github/workflows/e2e-tests.yml` for automated E2E testing on PR and push events.

The workflow:

1. Sets up Node.js and dependencies
2. Installs Maestro CLI
3. Builds Expo development build
4. Starts iOS Simulator or Android Emulator
5. Runs all Maestro test flows
6. Uploads test results and recordings as artifacts

## Troubleshooting

### App Not Found

```bash
# Verify app is installed
xcrun simctl listapps booted | grep guildpass

# Reinstall app
npx expo run:ios --device
```

### Test Timeout

- Increase timeout in flow:
  ```yaml
  - assertVisible:
      id: "element-id"
      timeout: 10000
  ```

### Element Not Found

- Check testID is correctly added to component
- Verify element is visible (not hidden or scrolled off-screen)
- Use Maestro Studio to inspect element hierarchy

### Simulator Issues

```bash
# Reset iOS Simulator
xcrun simctl erase all

# Restart Android Emulator
adb reboot
```

## Best Practices

1. **Keep tests independent**: Each test should be able to run in isolation
2. **Use descriptive test IDs**: Make element identification clear
3. **Add timeouts**: Network requests need appropriate wait times
4. **Clean state**: Reset app state between tests when needed
5. **Mock network**: Reduce flakiness by mocking API responses
6. **Record failures**: Use `--format junit` to capture test results

## Resources

- [Maestro Documentation](https://maestro.mobile.dev/getting-started/introduction)
- [Maestro Best Practices](https://maestro.mobile.dev/best-practices/best-practices)
- [Expo Testing Guide](https://docs.expo.dev/develop/unit-testing/)
- [React Native Testing](https://reactnative.dev/docs/testing-overview)

## Contributing

When adding new screens or features:

1. Add `testID` props to interactive elements
2. Create corresponding Maestro flow in `.maestro/`
3. Update this README with new test coverage
4. Ensure tests pass locally before opening PR

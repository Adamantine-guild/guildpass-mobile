# E2E Testing Guide for GuildPass Mobile

This guide covers end-to-end testing for GuildPass Mobile using Maestro, including setup, writing tests, CI integration, and best practices.

## Table of Contents

- [Why Maestro?](#why-maestro)
- [Installation](#installation)
- [Quick Start](#quick-start)
- [Writing E2E Tests](#writing-e2e-tests)
- [Test ID Best Practices](#test-id-best-practices)
- [Network Mocking](#network-mocking)
- [CI/CD Integration](#cicd-integration)
- [Troubleshooting](#troubleshooting)

## Why Maestro?

Maestro was chosen over alternatives like Detox for several reasons:

1. **Expo Compatibility**: Works seamlessly with Expo without ejecting
2. **Simple YAML Syntax**: Easy to read and write tests
3. **Fast Setup**: No complex configuration required
4. **Cross-Platform**: Single test file for iOS and Android
5. **Visual Debugging**: Maestro Studio for interactive development
6. **CI-Friendly**: Built-in support for GitHub Actions and other CI platforms

## Installation

### macOS/Linux

```bash
curl -Ls "https://get.maestro.mobile.dev" | bash
```

### Windows

Use WSL (Windows Subsystem for Linux):

```bash
wsl
curl -Ls "https://get.maestro.mobile.dev" | bash
```

### Verify Installation

```bash
maestro --version
```

## Quick Start

### 1. Build the App

```bash
# iOS (requires macOS and Xcode)
npx expo run:ios

# Android
npx expo run:android
```

This creates a development build with bundle ID `xyz.guildpass.mobile` that Maestro can interact with.

### 2. Start Development Server

In a separate terminal:

```bash
pnpm start
```

### 3. Run Tests

```bash
# All tests
pnpm test:e2e

# Single test
pnpm test:e2e:single .maestro/01-onboarding-to-profile.yaml

# Interactive mode
pnpm test:e2e:studio
```

## Writing E2E Tests

### Basic Structure

```yaml
appId: xyz.guildpass.mobile
---
# Test Description
# What this test validates

- launchApp
- assertVisible:
    id: "element-testID"
- tapOn:
    id: "button-testID"
- inputText: "sample text"
```

### Available Commands

#### Navigation

```yaml
- launchApp # Launch the app
- back # Press back button
- scroll # Scroll the screen
- swipe:
    direction: UP|DOWN|LEFT|RIGHT
```

#### Assertions

```yaml
- assertVisible:
    id: "testID" # Check element is visible
    timeout: 10000 # Optional timeout in ms

- assertVisible:
    text: "Welcome" # Check by text content

- assertNotVisible:
    id: "testID" # Check element not visible
```

#### Interactions

```yaml
- tapOn:
    id: "testID" # Tap on element

- tapOn:
    text: "Submit" # Tap by text

- inputText: "Hello World" # Enter text (requires prior focus)

- eraseText # Clear text field
```

#### Waiting

```yaml
- waitForAnimationToEnd:
    timeout: 5000

- runFlow:
    file: other-flow.yaml # Run another test flow
```

### Example: Complete Flow

```yaml
appId: xyz.guildpass.mobile
---
# E2E Test: User Registration and Login

- launchApp
- assertVisible:
    id: "welcome-screen"

# Navigate to signup
- tapOn:
    id: "signup-button"
- assertVisible:
    id: "signup-form"

# Fill form
- tapOn:
    id: "email-input"
- inputText: "test@example.com"
- tapOn:
    id: "password-input"
- inputText: "SecurePass123!"

# Submit
- tapOn:
    id: "submit-button"

# Verify success
- assertVisible:
    id: "dashboard-screen"
    timeout: 10000
```

## Test ID Best Practices

### Naming Convention

Follow these patterns for consistency:

```typescript
// Screens
testID = "onboarding-screen";
testID = "profile-screen";
testID = "guilds-screen";

// Buttons (actions)
testID = "submit-button";
testID = "cancel-button";
testID = "wallet-connect-button";

// Navigation buttons
testID = "navigate-guilds-button";
testID = "navigate-settings-button";

// Input fields
testID = "email-input";
testID = "password-input";
testID = "wallet-address-input";

// Status indicators
testID = "loading-indicator";
testID = "error-message";
testID = "success-banner";

// Data display
testID = "user-profile-data";
testID = "guild-list";
testID = "membership-status-card";
```

### Adding Test IDs to Components

#### Button Component

```typescript
interface ButtonProps {
  title: string;
  onPress: () => void;
  testID?: string;
}

export const Button = ({ title, onPress, testID }: ButtonProps) => (
  <TouchableOpacity onPress={onPress} testID={testID}>
    <Text>{title}</Text>
  </TouchableOpacity>
);

// Usage
<Button
  title="Connect"
  onPress={handleConnect}
  testID="wallet-connect-button"
/>
```

#### Screen Container

```typescript
export default function ProfileScreen() {
  return (
    <View testID="profile-screen">
      <Text testID="profile-title">My Profile</Text>
      <Button testID="edit-profile-button" />
    </View>
  );
}
```

### Guidelines

1. **Be specific**: `wallet-connect-button` not `button1`
2. **Use kebab-case**: `access-check-result` not `accessCheckResult`
3. **Include context**: `guild-name` not just `name`
4. **Unique per screen**: Don't reuse IDs across different screens
5. **Descriptive**: Make the purpose clear from the ID alone

## Network Mocking

E2E tests that depend on network requests need mocking to avoid flakiness.

### Option 1: Mock Service Worker (MSW)

Install MSW:

```bash
npm install --save-dev msw
```

Setup handlers:

```typescript
// tests/mocks/handlers.ts
import { http, HttpResponse } from "msw";

export const handlers = [
  http.get("/api/guilds", () => {
    return HttpResponse.json([
      { id: "guild_abc", name: "Alpha Guild" },
      { id: "guild_xyz", name: "Beta Community" },
    ]);
  }),

  http.post("/api/access-check", () => {
    return HttpResponse.json({
      hasAccess: true,
      reason: "User has required role",
    });
  }),
];
```

Start server:

```typescript
// tests/mocks/server.ts
import { setupServer } from "msw/node";
import { handlers } from "./handlers";

export const server = setupServer(...handlers);
```

### Option 2: Environment Variables

Use different API URLs for testing:

```yaml
# .maestro/04-access-check-success.yaml
appId: xyz.guildpass.mobile
env:
  EXPO_PUBLIC_API_URL: "http://localhost:3000"
---
- launchApp
# ... rest of test
```

Start local mock server:

```bash
# Using json-server
npx json-server --watch db.json --port 3000
```

### Option 3: Conditional Mocking in App

```typescript
// src/lib/guildpassClient.ts
const apiUrl =
  __DEV__ && process.env.EXPO_PUBLIC_USE_MOCK === "true"
    ? "http://localhost:3000"
    : process.env.EXPO_PUBLIC_API_URL;
```

Run tests with mock:

```bash
EXPO_PUBLIC_USE_MOCK=true maestro test .maestro/
```

## CI/CD Integration

### GitHub Actions

The project includes a workflow at `.github/workflows/e2e-tests.yml` that:

1. Runs on push to `main` or `develop`
2. Tests both iOS and Android
3. Uploads test results and recordings

#### Configuration

Set up these secrets in your GitHub repository:

```
EXPO_TOKEN: Your Expo access token
```

Get your token:

```bash
npx expo login
npx expo whoami --token
```

Add to GitHub: **Settings** → **Secrets and variables** → **Actions** → **New repository secret**

#### Triggering Tests

Tests run automatically on:

- Push to `main` or `develop` branches
- Pull requests to `main` or `develop`
- Manual workflow dispatch

View results:

1. Go to **Actions** tab in your repository
2. Select **E2E Tests** workflow
3. Click on a run to see results
4. Download artifacts (test results, recordings)

### Local CI Simulation

Test the CI configuration locally:

```bash
# Install act (GitHub Actions local runner)
# macOS
brew install act

# Run iOS workflow
act -j e2e-ios

# Run Android workflow
act -j e2e-android
```

## Troubleshooting

### App Not Found Error

**Problem**: Maestro can't find the app

```
Error: App xyz.guildpass.mobile not found
```

**Solution**:

```bash
# Check installed apps
xcrun simctl listapps booted | grep guildpass

# Reinstall
npx expo run:ios --device
```

### Element Not Found

**Problem**: Test fails with element not visible

```
Error: Element with id "button-id" not found
```

**Solutions**:

1. Verify testID is added to component
2. Check element isn't behind a modal or overlay
3. Add scroll if element is off-screen
4. Increase timeout:
   ```yaml
   - assertVisible:
       id: "button-id"
       timeout: 10000
   ```

### Simulator/Emulator Issues

**iOS Simulator**:

```bash
# List simulators
xcrun simctl list devices

# Erase all simulators
xcrun simctl erase all

# Boot specific simulator
xcrun simctl boot "iPhone 15"
```

**Android Emulator**:

```bash
# List emulators
emulator -list-avds

# Start emulator
emulator @Pixel_6_API_33

# Restart ADB
adb kill-server
adb start-server
```

### Test Flakiness

**Problem**: Tests pass sometimes, fail other times

**Solutions**:

1. **Add waits**: Wait for animations and network requests

   ```yaml
   - waitForAnimationToEnd:
       timeout: 3000
   ```

2. **Mock network**: Remove dependency on external APIs

3. **Reset state**: Clear app data between tests

   ```yaml
   - clearState
   - launchApp
   ```

4. **Use stable selectors**: Prefer testID over text content

### Build Errors

**Expo prebuild fails**:

```bash
# Clean and retry
rm -rf ios android
npx expo prebuild --clean
```

**Xcode build fails**:

```bash
# Clean build folder
cd ios
xcodebuild clean
pod install
cd ..
```

**Android Gradle errors**:

```bash
cd android
./gradlew clean
cd ..
```

## Best Practices

### 1. Test Independence

Each test should run independently:

```yaml
# Good: Resets state
- launchApp
- clearState
- launchApp

# Bad: Depends on previous test state
- tapOn:
    id: "next-button" # What if we're not on the right screen?
```

### 2. Descriptive Comments

```yaml
# Good
---
# E2E Test: Wallet Connection Flow
# Validates: User can enter wallet address and connect successfully
# Prerequisites: None (fresh install state)

# Bad
---
# Test 1
```

### 3. Use Helpers

Create reusable flows:

```yaml
# .maestro/helpers/login.yaml
appId: xyz.guildpass.mobile
---
- tapOn:
    id: "wallet-address-input"
- inputText: "0x1234567890123456789012345678901234567890"
- tapOn:
    id: "wallet-connect-button"
```

Use in tests:

```yaml
- runFlow:
    file: helpers/login.yaml
```

### 4. Meaningful Assertions

```yaml
# Good: Specific assertions
- assertVisible:
    id: "success-message"
- assertVisible:
    text: "Connection successful"

# Bad: Generic assertions
- assertVisible:
    text: "Success"
```

### 5. Cleanup

Reset state after tests:

```yaml
- tapOn:
    id: "settings-button"
- tapOn:
    id: "reset-app-button"
- tapOn:
    id: "confirm-reset-button"
```

## Resources

- [Maestro Documentation](https://maestro.mobile.dev/)
- [Maestro CLI Reference](https://maestro.mobile.dev/cli/commands)
- [Expo Testing Guide](https://docs.expo.dev/develop/unit-testing/)
- [React Native Testing Library](https://callstack.github.io/react-native-testing-library/)

## Contributing

When adding new features:

1. **Add testID props** to all interactive elements
2. **Create Maestro flows** covering happy path and error cases
3. **Update documentation** in `.maestro/README.md`
4. **Run tests locally** before opening PR
5. **Check CI passes** for both iOS and Android

---

For questions or issues, contact the maintainer or open a GitHub issue.

<div align="center">
  <img src="https://raw.githubusercontent.com/guildpass/brand/main/logo-mobile.png" alt="GuildPass Mobile Logo" width="120" />
  <h1>GuildPass Mobile</h1>
  <p><strong>Secure, on-the-go access control and guild management.</strong></p>

  <p>
    <a href="https://expo.dev"><img src="https://img.shields.io/badge/platform-ios%20%7C%20android-000000?style=flat-square&logo=expo&logoColor=white" alt="platform" /></a>
    <a href="https://github.com/Adamantine-Guild/guildpass-mobile/actions"><img src="https://img.shields.io/github/actions/workflow/status/Adamantine-Guild/guildpass-mobile/test.yml?branch=main&style=flat-square" alt="build status" /></a>
    <a href="https://opensource.org/licenses/MIT"><img src="https://img.shields.io/badge/license-MIT-blue?style=flat-square" alt="license" /></a>
    <a href="https://typescriptlang.org"><img src="https://img.shields.io/badge/typescript-%23007acc.svg?style=flat-square&logo=typescript&logoColor=white" alt="typescript" /></a>
  </p>

  <p align="center">
    <a href="#-key-features">Key Features</a> •
    <a href="#-getting-started">Getting Started</a> •
    <a href="#-architecture">Architecture</a> •
    <a href="#-testing">Testing</a> •
    <a href="#-roadmap">Roadmap</a> •
    <a href="#-contributing">Contributing</a>
  </p>
</div>

---

> **Part of the [Adamantine-Guild](https://github.com/Adamantine-Guild) project** — a Web3 membership and token-gated community platform built for the open-source ecosystem.

## 📱 Experience the Protocol

GuildPass Mobile is the official gateway to the GuildPass ecosystem for iOS and Android. It empowers users to manage their digital memberships, verify on-chain roles, and unlock token-gated experiences directly from their mobile devices. Built with performance and security at its core, it leverages modern Web3 standards to provide a seamless user experience.

## ✨ Key Features

- **🛡️ Universal Membership**: View all your active guild memberships and assigned roles in a unified dashboard.
- **📷 QR Access Check**: Scan GuildPass access QR codes to instantly verify token-gated resource permissions.
- **🔍 Instant Verification**: Execute real-time protocol checks for token-gated resources with zero friction.
- **🌐 Cross-Chain Support**: Explore guild configurations and role requirements across supported EVM networks.
- **⚡ High Performance**: Native-speed interactions powered by React Native and efficient server-state management.
- **🎨 Fluid Design**: A beautiful, accessible UI built with NativeWind, optimized for both light and dark environments.

## 🚀 Getting Started

### Prerequisites

- **Node.js**: 18.0 or higher
- **Package Manager**: pnpm (recommended) or npm
- **Mobile Environment**: Expo Go installed on your device, or configured iOS/Android simulators.

### Installation

```bash
# Clone the repository
git clone https://github.com/Adamantine-Guild/guildpass-mobile.git
cd guildpass-mobile

# Install dependencies
pnpm install

# Set up environment variables
cp .env.example .env
# Edit .env with your API URL and chain ID
```

### Development

```bash
# Start the development server
pnpm start

# Launch on specific platforms
pnpm ios
pnpm android
```

## 🏗️ Architecture

The application is built on a robust, feature-driven foundation designed for long-term maintainability:

- **Routing**: [Expo Router](https://docs.expo.dev/router/introduction/) for type-safe, file-based navigation.
- **State**: [Zustand](https://github.com/pmndrs/zustand) for client state and [TanStack Query](https://tanstack.com/query) for server synchronization.
- **Styling**: [NativeWind](https://www.nativewind.dev/) for high-performance Tailwind CSS utility styling.
- **SDK**: Seamless integration with the core [@guildpass/sdk](../guildpass-sdk).

### Project structure

| Path                   | Purpose                                      |
| ---------------------- | -------------------------------------------- |
| `app/`                 | Expo Router file-based pages and layouts     |
| `app/access-scanner.tsx` | QR code scanner screen using expo-camera   |
| `src/features/access/` | Access check hooks and QR payload validation |
| `src/`                 | Feature modules, hooks, stores, and services |
| `docs/`                | Architecture and integration guides          |
| `tests/`               | Vitest unit tests                            |

## 🧪 Testing

```bash
# Run all tests (watch mode)
pnpm test

# Run tests once (CI mode)
pnpm test:run

# Type checking
pnpm typecheck

# Lint
pnpm lint

# Format
pnpm format
```

## 🚀 Build & Release

GuildPass Mobile uses **EAS Build** with three distinct profiles:

| Profile       | Distribution  | Channel        | Use Case                     |
|---------------|---------------|----------------|------------------------------|
| `development` | Internal      | `development`  | Local dev & debug builds     |
| `preview`     | Internal      | `preview`      | QA / TestFlight / Beta       |
| `production`  | Store         | `production`   | App Store & Play Store       |

```bash
# Development build (APK / debug)
eas build --profile development --platform all

# Preview build (AAB / release for testers)
eas build --profile preview --platform all

# Production build (AAB / release for stores)
eas build --profile production --platform all

# Submit to stores
eas submit --profile production --platform ios
eas submit --profile production --platform android
```

See [docs/release.md](./docs/release.md) for the full release guide, environment matrix, and preflight checklist.

### Environment Variables

Copy `.env.example` to `.env` and fill in your values. Environment variables prefixed with `EXPO_PUBLIC_` are available at runtime. Sensitive values must be stored as EAS Secrets.

## QR access check payload

QR access checks use a JSON payload encoded directly in the QR code:

```json
{
  "type": "guildpass.access-check",
  "version": 1,
  "guildId": "guild_abc",
  "resourceId": "vip-door",
  "walletAddress": "0x1234567890123456789012345678901234567890",
  "expiresAt": "2026-06-23T12:05:00.000Z"
}
```

`type`, `version`, `guildId`, and `resourceId` are required. `walletAddress` and `expiresAt`
are optional. Unsupported types or versions, malformed JSON, missing required fields, invalid
wallet addresses, and expired payloads are rejected before the access check is submitted.

## 🗺️ Roadmap

- [ ] **Native Wallet Integration**: Support for WalletConnect, MetaMask, and Coinbase Wallet.
- [ ] **Smart Onboarding**: Social login and embedded wallets for non-crypto native users.
- [ ] **Push Notifications**: Real-time alerts for role updates and access grants.
- [x] **QR Access Verification**: Scan GuildPass QR codes to verify token-gated resource access from the mobile app.
- [ ] **Offline Resilience**: Advanced caching layer for viewing memberships without connectivity.

## 🤝 Contributing

We welcome contributions from the community! See [CONTRIBUTING.md](./CONTRIBUTING.md) for the full guide.

1. Browse open issues tagged [`good first issue`](https://github.com/Adamantine-Guild/guildpass-mobile/issues?q=label%3A%22good+first+issue%22) or [`help wanted`](https://github.com/Adamantine-Guild/guildpass-mobile/issues?q=label%3A%22help+wanted%22).
2. Comment on the GitHub issue you'd like to work on.
3. Fork the repo, create a feature branch, implement your change, open a PR.

### Maintainer contact

- Contact: cerealboxx123@gmail.com

## 📄 License

Distributed under the MIT License. See [LICENSE](./LICENSE) for more information.

---

<div align="center">
  <p>Crafted with precision by the <b>GuildPass</b> team</p>
  <a href="https://guildpass.xyz">guildpass.xyz</a>
</div>

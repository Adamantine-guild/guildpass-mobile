# Contributing to GuildPass Mobile

Thank you for your interest in contributing to GuildPass Mobile! This is the React Native / Expo app for the GuildPass ecosystem.

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Ways to Contribute](#ways-to-contribute)
- [Finding Issues](#finding-issues)
- [Development Setup](#development-setup)
- [Branching & Commits](#branching--commits)
- [Submitting a Pull Request](#submitting-a-pull-request)
- [Review Process](#review-process)
- [Communication](#communication)

---

## Code of Conduct

By participating you agree to our [Code of Conduct](./CODE_OF_CONDUCT.md).

---

## Ways to Contribute

- Fix UI bugs or screen-level regressions
- Add or improve Expo Router screens
- Improve NativeWind/Tailwind styling
- Add Vitest unit tests for hooks or store logic
- Improve Zustand state management
- Improve TanStack Query data fetching
- Write or improve documentation in `docs/`

---

## Finding Issues

1. Browse issues directly on GitHub:
   - [`good first issue`](https://github.com/Adamantine-Guild/guildpass-mobile/issues?q=label%3A%22good+first+issue%22)
   - [`help wanted`](https://github.com/Adamantine-Guild/guildpass-mobile/issues?q=label%3A%22help+wanted%22)
2. Comment `I'd like to work on this` on the GitHub issue you'd like to work on.
3. Wait for a maintainer to assign it before starting.

---

## Development Setup

### Prerequisites

- Node.js 18+
- pnpm (recommended) or npm
- Expo Go on a physical device, or Xcode/Android Studio for simulators

### Steps

```bash
# 1. Fork and clone
git clone https://github.com/<your-username>/guildpass-mobile.git
cd guildpass-mobile

# 2. Install dependencies
pnpm install

# 3. Set up environment variables
cp .env.example .env
# Edit .env — set EXPO_PUBLIC_API_URL if connecting to live guildpass-core

# 4. Initialize EAS (Optional for local development)
# If you plan to use EAS Build for testing your fork, you must initialize your own EAS project:
npx eas init --id <YOUR_PROJECT_ID>
# Or create a new one:
npx eas init

# 5. Start the Expo dev server
pnpm start

# 6. Open on device / simulator
pnpm ios      # iOS simulator
pnpm android  # Android emulator
# Or scan the QR code in Expo Go
```

### Project structure

| Path     | Purpose                                          |
| -------- | ------------------------------------------------ |
| `app/`   | Expo Router file-based pages and layouts         |
| `src/`   | Feature modules, hooks, Zustand stores, services |
| `docs/`  | Architecture and integration guides              |
| `tests/` | Vitest unit tests                                |

---

## Branching & Commits

- Branch off `main`: `git checkout -b feat/short-description` or `fix/short-description`
- Conventional commits:
  - `feat: add membership expiry countdown screen`
  - `fix: correct role badge colour for admin`
  - `test: add unit tests for membership store`
  - `style: adjust NativeWind spacing on dashboard card`
  - `chore: upgrade Expo SDK to 51`

---

## Submitting a Pull Request

1. Push your branch to your fork.
2. Open a PR against `Adamantine-Guild/guildpass-mobile` on `main`.
3. Fill in the [PR template](.github/PULL_REQUEST_TEMPLATE.md) completely.
4. Ensure these pass before submitting:

```bash
pnpm typecheck   # Must pass with no errors
pnpm lint        # Fix all reported issues
pnpm test:run    # All tests must pass
```

### PR Quality Expectations

- UI changes must include a screenshot or screen recording in the PR description.
- Use NativeWind (Tailwind) classes — no `StyleSheet.create` for new UI unless justified.
- New screens must handle loading, empty, and error states.
- New business logic must have at least one Vitest unit test.
- Avoid generated boilerplate comments that only restate imports, returns, variable bindings, or JSX structure. Keep comments for non-obvious domain rules, edge cases, TODOs with context, or implementation tradeoffs.
- Do not introduce native modules that break Expo Go compatibility without prior discussion.

---

## Review Process

- A maintainer will review your PR within **5 business days**.
- Mobile PRs with UI changes may require a screen recording.
- Address requested changes promptly.

----

## SDK Development

If you need to make changes to the GuildPass SDK while working on the mobile app:

1. Clone the SDK repository:
   ```bash
   git clone https://github.com/Adamantine-Guild/guildpass-sdk.git ../guildpass-sdk
   ```
2. Link the SDK to the mobile project:
   ```bash
   # In the guildpass-mobile directory
   pnpm add ../guildpass-sdk
   ```
3. When finished, revert to the remote dependency:
   ```bash
   pnpm add @guildpass/sdk@github:Adamantine-Guild/guildpass-sdk
   ```

## Communication

- GitHub Issues: preferred for task discussion and bug reports
- Contact: cerealboxx123@gmail.com

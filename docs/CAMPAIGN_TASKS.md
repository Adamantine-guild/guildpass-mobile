# GuildPass Mobile Tasks

This document lists tasks suitable for open contributions.

---

## 🟢 Ready to Contribute

### TASK-MOB-001: Add loading skeleton to the membership dashboard screen

- **Difficulty**: Easy
- **Labels**: `good first issue`, `ui`
- **Description**: The membership dashboard screen shows a blank screen while data loads. Add a NativeWind skeleton loader that matches the layout of the loaded content.
- **Files to change**: The membership dashboard screen in `app/` or `src/`
- **Acceptance criteria**:
  - Skeleton visible during data fetch
  - Skeleton layout matches the real content structure
  - Works on both iOS and Android
- **Tests**: Visual verification; `pnpm typecheck` passes
- **Reviewer expectations**: NativeWind only, no `StyleSheet.create`; screenshot in PR

---

### TASK-MOB-002: Add unit tests for the Zustand membership store

- **Difficulty**: Easy–Medium
- **Labels**: `good first issue`, `tests`, `state`
- **Description**: The Zustand membership store has no unit tests. Add Vitest tests covering state transitions (loading, success, error).
- **Files to change**: `tests/` (add store test file)
- **Acceptance criteria**:
  - Tests for initial state, loading state, success state, and error state
  - Tests are isolated — no network calls
  - `pnpm test:run` passes
- **Tests**: `pnpm test:run`
- **Reviewer expectations**: Clear test descriptions; mock any SDK calls

---

### TASK-MOB-003: Improve accessibility on the role badge component

- **Difficulty**: Easy
- **Labels**: `good first issue`, `a11y`, `ui`
- **Description**: Role badges (admin, member, contributor) are not announced correctly by screen readers. Add `accessibilityLabel` props.
- **Files to change**: The role badge component in `src/` or `components/`
- **Acceptance criteria**:
  - Each badge has a meaningful `accessibilityLabel` (e.g., "Role: Admin")
  - Passes manual screen reader test on iOS VoiceOver and/or Android TalkBack
- **Tests**: Manual accessibility test; `pnpm typecheck` passes
- **Reviewer expectations**: Correct React Native accessibility props; no visual regressions

---

### TASK-MOB-004: Add a CI workflow for tests and type-checking

- **Difficulty**: Easy
- **Labels**: `good first issue`, `tests`
- **Description**: Add a GitHub Actions workflow that runs `pnpm typecheck`, `pnpm lint`, and `pnpm test:run` on every push and PR.
- **Files to change**: `.github/workflows/ci.yml` (new)
- **Acceptance criteria**:
  - Triggers on `push` and `pull_request` to `main`
  - Node 18, pnpm setup, typecheck, lint, test:run steps
  - Workflow fails if any step fails
- **Tests**: Workflow passes on a draft PR
- **Reviewer expectations**: Clean YAML; use `pnpm/action-setup`

---

### TASK-MOB-005: Write the integration guide for using @guildpass/sdk in a new Expo project

- **Difficulty**: Easy
- **Labels**: `good first issue`, `documentation`
- **Description**: The `docs/integration-guide.md` is sparse. Expand it with step-by-step instructions for installing `@guildpass/sdk` in a new Expo project, initialising the client, and performing an access check.
- **Files to change**: `docs/integration-guide.md`
- **Acceptance criteria**:
  - Clear prerequisites section (Node, pnpm, Expo)
  - Working TypeScript code examples
  - Covers installation, client init, and a basic `checkAccess` call
- **Tests**: Docs render correctly in any Markdown viewer
- **Reviewer expectations**: Code examples must be syntactically valid TypeScript

---

## 🟡 Planned (not yet open)

- Add WalletConnect integration screen
- Implement push notification permission flow
- Add QR code generation screen for event access
- Implement offline membership caching with MMKV

---

_To work on a task, comment on the linked GitHub issue._

# E2E Testing Contribution Checklist

Use this checklist when adding new features or modifying existing screens.

## ✅ Adding a New Screen

- [ ] Add `testID` prop to screen container

  ```tsx
  <View testID="my-new-screen">
  ```

- [ ] Add `testID` props to all interactive elements
  - [ ] Buttons: `{action}-button`
  - [ ] Inputs: `{field-name}-input`
  - [ ] Navigation items: `navigate-{destination}-button`

- [ ] Create Maestro test flow file
  - [ ] Name: `.maestro/XX-feature-name.yaml`
  - [ ] Include descriptive comments
  - [ ] Test happy path
  - [ ] Test error scenarios

- [ ] Add flow to config
  - [ ] Update `.maestro/config.yaml`

- [ ] Update documentation
  - [ ] Add entry to `.maestro/README.md`
  - [ ] Update test coverage section

- [ ] Test locally
  - [ ] Run: `maestro test .maestro/XX-feature-name.yaml`
  - [ ] Verify on iOS
  - [ ] Verify on Android (if possible)

- [ ] Verify CI passes
  - [ ] Check GitHub Actions after pushing

## ✅ Modifying Existing Screen

- [ ] Check if testID props changed
  - [ ] If yes, update corresponding Maestro flows

- [ ] Check if user flow changed
  - [ ] If yes, update test steps

- [ ] Run affected tests

  ```bash
  maestro test .maestro/
  ```

- [ ] Verify no regressions
  - [ ] All existing tests should still pass

## ✅ Adding Interactive Component

When creating a new reusable component:

- [ ] Add `testID` prop to component interface

  ```tsx
  interface MyComponentProps {
    testID?: string;
    // ... other props
  }
  ```

- [ ] Pass `testID` to root element

  ```tsx
  <TouchableOpacity testID={testID}>
  ```

- [ ] Document testID usage in component comments
  ```tsx
  /**
   * @param testID - Optional test identifier for E2E tests
   */
  ```

## ✅ Pull Request Checklist

Before opening PR:

- [ ] All new components have testID support
- [ ] Test flows created for new features
- [ ] Tests pass locally
- [ ] Documentation updated
- [ ] Ran `npm run lint` and `npm run typecheck`
- [ ] Added E2E test coverage note in PR description

In PR description, include:

```markdown
## E2E Test Coverage

- [ ] Added testID props to: [list components]
- [ ] Created Maestro flows: [list files]
- [ ] Tests passing locally: ✅
- [ ] Test coverage: [describe what's tested]
```

## ✅ Code Review Checklist

When reviewing PRs:

- [ ] Verify testID props follow naming convention
- [ ] Check if Maestro flows are needed
- [ ] Confirm tests are added if UI changes
- [ ] Review test coverage completeness
- [ ] Check CI test results

## Test ID Naming Reference

| Element Type | Pattern                  | Example                    |
| ------------ | ------------------------ | -------------------------- |
| Screen       | `{name}-screen`          | `profile-screen`           |
| Button       | `{action}-button`        | `submit-button`            |
| Input        | `{field}-input`          | `email-input`              |
| Navigation   | `navigate-{dest}-button` | `navigate-settings-button` |
| Status       | `{feature}-{state}`      | `loading-indicator`        |
| Error        | `{feature}-error`        | `login-error`              |
| Success      | `{feature}-success`      | `payment-success`          |

## Common Mistakes to Avoid

❌ **Don't**: Use generic IDs

```tsx
testID = "button1";
testID = "input";
```

✅ **Do**: Use descriptive IDs

```tsx
testID = "wallet-connect-button";
testID = "email-input";
```

❌ **Don't**: Reuse IDs across screens

```tsx
// Screen A
<Button testID="submit-button" />
// Screen B
<Button testID="submit-button" />
```

✅ **Do**: Make IDs unique per screen

```tsx
// Login Screen
<Button testID="login-submit-button" />
// Signup Screen
<Button testID="signup-submit-button" />
```

❌ **Don't**: Test implementation details

```yaml
- tapOn:
    id: "internal-api-call-trigger"
```

✅ **Do**: Test user-facing behavior

```yaml
- tapOn:
    id: "submit-button"
- assertVisible:
    id: "success-message"
```

## Getting Help

- 📖 Read [E2E Testing Guide](../docs/e2e-testing-guide.md)
- 🚀 Check [Quick Start](QUICKSTART.md)
- 💬 Ask in PR comments
- 📧 Contact maintainer

---

Remember: Good E2E tests = Better user experience! 🎯

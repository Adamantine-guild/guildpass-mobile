# GitHub Labels — GuildPass Mobile

Create labels via **GitHub Settings → Labels** or with the GitHub CLI:

```bash
gh label create "good first issue" --color "7057ff" --description "Well-scoped task for new contributors"
gh label create "help wanted" --color "008672" --description "Extra attention or contributor help needed"
gh label create "bug" --color "d73a4a" --description "Something is not working"
gh label create "feature" --color "a2eeef" --description "New feature or enhancement request"
gh label create "documentation" --color "0075ca" --description "Improvements or additions to documentation"
gh label create "ios" --color "d4e9f7" --description "iOS-specific issue or fix"
gh label create "android" --color "d7f7d0" --description "Android-specific issue or fix"
gh label create "ui" --color "fef2c0" --description "UI component or visual change"
gh label create "navigation" --color "f9d0c4" --description "Expo Router / navigation changes"
gh label create "state" --color "bfd4f2" --description "Zustand or TanStack Query changes"
gh label create "tests" --color "c5def5" --description "Related to Vitest test coverage"
gh label create "a11y" --color "b2dfdb" --description "Accessibility improvement"
gh label create "priority: low" --color "eeeeee" --description "Low priority"
gh label create "priority: medium" --color "fbca04" --description "Medium priority"
gh label create "priority: high" --color "e99695" --description "High priority — address promptly"
gh label create "needs-triage" --color "ededed" --description "Awaiting maintainer triage"
gh label create "duplicate" --color "cfd3d7" --description "This issue or PR already exists"
```

## Label Usage Guide

| Label              | When to use                                       |
| ------------------ | ------------------------------------------------- |
| `good first issue` | Clear scope, low risk, great for new contributors |
| `help wanted`      | Community help wanted                             |
| `bug`              | Confirmed broken behaviour                        |
| `feature`          | New screen, component, or capability              |
| `documentation`    | `docs/` or README changes                         |
| `ios`              | iOS-only issue                                    |
| `android`          | Android-only issue                                |
| `ui`               | Visual-only changes                               |
| `navigation`       | Expo Router / screen navigation changes           |
| `state`            | Zustand store or TanStack Query changes           |
| `tests`            | Test-only additions or fixes                      |
| `a11y`             | Accessibility improvements                        |
| `priority: high`   | Blocks users — address within 48 h                |

# Accessibility Guidelines

GuildPass Mobile aims to provide an inclusive experience for all users, including those who rely on screen readers (VoiceOver on iOS, TalkBack on Android), switch access, and other assistive technologies.

## Core Principles

- Every interactive element must have a meaningful `accessibilityLabel`.
- Decorative elements (icons, dividers, emoji) must be hidden from screen readers using `accessibilityElementsHidden` / `importantForAccessibility="no-hide-descendants"`.
- Status changes and errors must be announced via `accessibilityLiveRegion` or `accessibilityRole="alert"`.
- Screen section titles use `accessibilityRole="header"` so navigation shortcuts work correctly.

---

## Component Patterns

### Buttons

Use the `Button` component for all interactive actions. It automatically sets:
- `accessibilityRole="button"`
- `accessibilityLabel` (falls back to `title` if not provided)
- `accessibilityState={{ disabled, busy: loading }}`

Always provide a custom `accessibilityHint` when the action is not obvious:

```tsx
<Button
  title="Disconnect"
  onPress={handleDisconnect}
  variant="outline"
  accessibilityLabel="Disconnect wallet"
  accessibilityHint="Removes your connected wallet and returns to the connect screen"
/>
```

### Navigation Items

Navigation `TouchableOpacity` elements use `accessibilityRole="link"`. Child content that duplicates the label should be suppressed:

```tsx
<TouchableOpacity
  accessibilityRole="link"
  accessibilityLabel="My Guilds"
  accessibilityHint="View your memberships and roles"
>
  <Card className="flex-row justify-between items-center">
    <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Text>My Guilds</Text>
      <Text>View your memberships and roles</Text>
    </View>
    <Text accessibilityElementsHidden importantForAccessibility="no-hide-descendants">→</Text>
  </Card>
</TouchableOpacity>
```

### Toggle Switches

Custom toggle views use `accessibilityRole="switch"` and `accessibilityState={{ checked }}`. The visual knob should be suppressed:

```tsx
<TouchableOpacity
  accessibilityRole="switch"
  accessibilityLabel="Require Biometrics for Access Checks"
  accessibilityHint="When enabled, requires Face ID or passcode before scanning QR codes"
  accessibilityState={{ checked: biometricRequired }}
  onPress={toggle}
>
  {/* label text */}
  <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
    {/* visual toggle track + knob */}
  </View>
</TouchableOpacity>
```

### Form Inputs

All `TextInput` fields must have both `accessibilityLabel` and `accessibilityHint`. Validation errors should be announced immediately:

```tsx
<TextInput
  accessibilityLabel="Guild ID"
  accessibilityHint="Enter the guild identifier, e.g. alpha-guild"
/>
{error && (
  <Text
    accessibilityRole="alert"
    accessibilityLiveRegion="assertive"
  >
    {error}
  </Text>
)}
```

### Status / Alert Cards

Use `accessibilityRole="alert"` and `accessibilityLiveRegion="assertive"` for error conditions that require immediate attention. Use `"polite"` for non-critical updates:

```tsx
// Errors – announce immediately
<View accessibilityRole="alert" accessibilityLiveRegion="assertive">
  <Text>QR code rejected: …</Text>
</View>

// Status updates – announce when idle
<View accessibilityLiveRegion="polite">
  <Text>Access Granted</Text>
</View>
```

### Decorative Icons and Emoji

Hide all purely decorative content from the accessibility tree:

```tsx
<Text
  accessibilityElementsHidden
  importantForAccessibility="no-hide-descendants"
>
  ✓
</Text>
```

### Composite Elements (Badges, Cards)

When a parent `View` provides the full accessible description, suppress all children:

```tsx
<View
  accessibilityLabel="Role: Admin (premium)"
  accessibilityRole="text"
>
  <Text accessibilityElementsHidden importantForAccessibility="no-hide-descendants">★</Text>
  <Text accessibilityElementsHidden importantForAccessibility="no-hide-descendants">Admin</Text>
</View>
```

---

## Screen Structure

Each screen should follow this hierarchy for logical focus order:

1. **Screen header** – `AppHeader` with `accessibilityRole="header"` on the title.
2. **Status banners** – `StaleDataBanner`, `OfflineBanner` with `accessibilityRole="alert"`.
3. **Primary content** – scrollable area.
4. **Section headings** – use `accessibilityRole="header"` on section title `Text` elements.
5. **Actions** – buttons at the end of each logical group.

---

## Live Region Guidelines

| Scenario | `accessibilityLiveRegion` | `accessibilityRole` |
|----------|--------------------------|---------------------|
| Form validation error | `assertive` | `alert` |
| QR scan result (success/failure) | `assertive` | `alert` |
| Loading / busy state | `polite` | — |
| Offline / stale data banner | `polite` | `alert` |
| Countdown timer expiry | `assertive` | `alert` |

---

## Color Contrast

All text must meet WCAG AA contrast ratios (4.5:1 for body text, 3:1 for large text).

Key theme token pairings:
- `text` (#1e293b) on `background` (#f8fafc) — ✅ passes
- `text-muted` (#64748b) on `background` (#f8fafc) — ✅ passes
- `primary` (#6366f1) on `white` — ✅ passes for large/bold text; verify for small body text
- `error` (#ef4444) on white — ✅ passes for large/bold text
- `success` (#22c55e) on white — ⚠️ borderline; always pair with bold weight or an icon

Dark mode uses `dark:` NativeWind variants. Ensure each custom dark colour maintains the same contrast ratio as its light counterpart.

---

## Testing Checklist

Before shipping any screen or component, verify:

- [ ] All interactive elements have `accessibilityRole` and `accessibilityLabel`.
- [ ] Decorative icons/emoji are hidden with `accessibilityElementsHidden`.
- [ ] Errors are announced via `accessibilityRole="alert"` or `AccessibilityInfo.announceForAccessibility`.
- [ ] Loading states set `accessibilityState={{ busy: true }}` on the container.
- [ ] Section headings use `accessibilityRole="header"`.
- [ ] Focus order matches the visual top-to-bottom, left-to-right hierarchy.
- [ ] Manual VoiceOver (iOS) and TalkBack (Android) sweep of the primary workflow.

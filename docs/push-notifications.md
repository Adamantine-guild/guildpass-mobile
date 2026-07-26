# Push Notifications

This document describes the mobile app's push notification implementation and the backend integration contract required for sending notifications.

## Overview

GuildPass Mobile implements Expo's push notification service to deliver real-time alerts about:

- **Role updates**: When a user is assigned a new role or their roles change in a guild
- **Access grants**: When a user gains access to new resources, including time-sensitive event access

The mobile app handles:
- Permission request with clear rationale UI
- Push token registration and storage
- Notification receipt and deep-link routing
- Settings toggle to enable/disable notifications

The backend is responsible for:
- Storing user push tokens
- Detecting role/access changes that warrant notifications
- Sending push notifications via Expo's Push Notification API

## Mobile Implementation

### Architecture

The push notification implementation follows the app's feature-driven architecture:

```
src/features/notifications/
├── pushNotifications.types.ts      # TypeScript types for notification data
├── pushNotifications.store.ts      # Zustand store for preferences and push token
├── pushNotifications.service.ts    # Core notification service (permissions, registration)
├── usePushNotifications.ts         # React hook for components
└── PushNotificationRationale.tsx   # Permission rationale UI component

app/
├── push-notification-setup.tsx     # Setup/rationale screen
└── settings.tsx                     # Settings with push notification toggle
```

### Permission Flow

1. **User opts in**: User taps the push notification toggle in Settings
2. **Rationale shown**: App displays `PushNotificationRationale` explaining the benefits
3. **Permission requested**: User accepts → OS permission dialog shown
4. **Token registration**: On permission grant, app registers with Expo and gets a push token
5. **Token stored**: Push token is persisted to SecureStore and the store

The rationale screen follows iOS/Android best practices by **explaining the value proposition before showing the system permission dialog**.

### Notification Data Structure

All push notifications include deep-link data for routing:

```typescript
interface NotificationData {
  type: "role-updated" | "access-granted";
  guildId: string;
  deepLink: string; // Full guildpass:// or https://guildpass.xyz/ URL
}

// Role update notification
interface RoleUpdateNotificationData extends NotificationData {
  type: "role-updated";
  roleName: string;
  action: "added" | "removed";
}

// Access granted notification
interface AccessGrantedNotificationData extends NotificationData {
  type: "access-granted";
  resourceId: string;
  resourceName?: string;
}
```

### Deep Link Integration

Push notifications reuse the existing deep-link system documented in [`docs/deep-linking.md`](./deep-linking.md).

**Supported deep link formats:**

| Notification Type | Deep Link Example |
|-------------------|-------------------|
| Role update | `guildpass://guild/{guildId}` |
| Access granted | `guildpass://access-check?guildId={id}&resourceId={id}` |

When a user taps a notification:
1. `usePushNotifications` extracts the `deepLink` from notification data
2. `parseDeepLink()` validates the URL against documented rules
3. Valid links route to the target screen; invalid links show error screen
4. All validation (guild ID, resource ID, wallet address) applies

### Settings Toggle

Users can enable/disable push notifications in **Settings → Notifications**.

- **Enable**: Shows rationale screen → requests permissions → registers push token
- **Disable**: Unregisters from notifications, clears badge, dismisses all notifications
- **Not supported**: Simulators and unsupported devices show a disabled state

The toggle state is persisted in `usePushNotificationsStore` (SecureStore-backed).

## Backend Integration Contract

The backend must implement push notification triggers when relevant events occur.

### Required Backend Changes

#### 1. Store Push Tokens

When the mobile app registers a push token, it must be sent to the backend and stored per user/wallet.

**Endpoint suggestion:**
```
POST /api/v1/push-tokens
Content-Type: application/json

{
  "walletAddress": "0x1234...",
  "pushToken": "ExponentPushToken[...]",
  "platform": "ios" | "android"
}
```

**Storage schema suggestion:**
```sql
CREATE TABLE push_tokens (
  id UUID PRIMARY KEY,
  wallet_address TEXT NOT NULL,
  push_token TEXT NOT NULL UNIQUE,
  platform TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  INDEX idx_wallet (wallet_address)
);
```

#### 2. Detect Trigger Events

The backend should send push notifications when:

**Role Update Events:**
- A user is assigned a new role in a guild
- A user's role is removed or modified
- Role requirements change and a user newly qualifies (or no longer qualifies)

**Access Grant Events:**
- A user gains access to a new resource
- Time-sensitive access is granted (e.g., event tickets)
- Access is granted based on a new role assignment

#### 3. Send Push Notifications

Use Expo's Push Notification API to send notifications.

**Expo Push API:**
```
POST https://exp.host/--/api/v2/push/send
Content-Type: application/json

{
  "to": "ExponentPushToken[...]",
  "title": "New Role Assigned",
  "body": "You've been assigned the 'VIP Member' role in Alpha Guild",
  "data": {
    "type": "role-updated",
    "guildId": "alpha-guild",
    "roleName": "VIP Member",
    "action": "added",
    "deepLink": "guildpass://guild/alpha-guild"
  },
  "sound": "default",
  "badge": 1
}
```

**Required `data` fields:**
- `type`: `"role-updated"` or `"access-granted"`
- `guildId`: The guild ID
- `deepLink`: A valid GuildPass deep link (see Deep Link Integration above)

**Additional fields by type:**

*Role update:*
- `roleName`: Human-readable role name
- `action`: `"added"` or `"removed"`

*Access granted:*
- `resourceId`: Resource identifier
- `resourceName` (optional): Human-readable resource name

### Example Notification Payloads

#### Role Update Notification
```json
{
  "to": "ExponentPushToken[xxxxxx]",
  "title": "New Role Assigned",
  "body": "You've been assigned the 'VIP Member' role in Alpha Guild",
  "data": {
    "type": "role-updated",
    "guildId": "alpha-guild",
    "roleName": "VIP Member",
    "action": "added",
    "deepLink": "guildpass://guild/alpha-guild"
  },
  "sound": "default",
  "badge": 1,
  "priority": "high"
}
```

#### Access Granted Notification
```json
{
  "to": "ExponentPushToken[xxxxxx]",
  "title": "Access Granted",
  "body": "You now have access to VIP Lounge in Alpha Guild",
  "data": {
    "type": "access-granted",
    "guildId": "alpha-guild",
    "resourceId": "vip-lounge",
    "resourceName": "VIP Lounge",
    "deepLink": "guildpass://access-check?guildId=alpha-guild&resourceId=vip-lounge"
  },
  "sound": "default",
  "badge": 1,
  "priority": "high"
}
```

### Backend Trigger Implementation Notes

**Deduplication:**
- Avoid sending duplicate notifications for the same event
- Track last notification timestamp per (user, guild, event type)

**Batching:**
- If multiple role changes occur simultaneously, consider batching into a single notification
- Example: "You've been assigned 3 new roles in Alpha Guild"

**Rate Limiting:**
- Respect Expo's rate limits (roughly 1000 notifications per second)
- Implement exponential backoff for failed sends

**Error Handling:**
- `DeviceNotRegistered` error → remove invalid push token from database
- `MessageTooBig` error → shorten notification content
- Network errors → retry with exponential backoff

**Privacy:**
- Only send notifications to users who have explicitly opted in
- Include minimal PII in notification body (guild name is fine, wallet address is not)

### Testing Push Notifications

**Mobile-side testing:**
```bash
# Run tests
pnpm test pushNotifications

# Manual testing on device (not simulator)
pnpm ios  # or pnpm android
# Navigate to Settings → Enable Push Notifications
# Send test notification via Expo's Push Notification Tool
```

**Expo Push Notification Tool:**
https://expo.dev/notifications

Use this tool to send test notifications to a registered push token during development.

**Backend testing:**
- Store a test push token in your development database
- Trigger a role change or access grant event
- Verify notification is sent via Expo API
- Verify notification appears on device and deep link routes correctly

## Security Considerations

**Push Token Storage:**
- Push tokens are stored in SecureStore (encrypted at rest on device)
- Backend should store push tokens securely and associate them with authenticated users

**Deep Link Validation:**
- All deep links in notifications go through the same validation as manually-opened links
- Malformed or unauthorized deep links route to error screen
- See [`docs/deep-linking.md`](./deep-linking.md) for validation rules

**Permission Model:**
- Users explicitly opt in via Settings toggle
- Permission can be revoked anytime
- App respects OS-level notification permissions

## Future Enhancements

**In scope for future iterations:**
- Notification preferences per guild (mute specific guilds)
- Rich notifications with images/actions
- Notification history screen
- Silent notifications for background sync

**Out of scope:**
- SMS or email fallback (push notifications only)
- In-app notification center (native notifications only)

## Troubleshooting

**Push notifications not received:**
1. Verify user has enabled notifications in Settings
2. Verify OS-level notification permissions are granted
3. Check push token is valid and stored in backend
4. Verify notification payload matches documented structure
5. Check Expo dashboard for delivery status/errors

**Deep links not working from notifications:**
1. Verify `deepLink` field is included in notification data
2. Check deep link format matches documented patterns
3. Verify deep link validation in [`tests/deepLink.test.ts`](../tests/deepLink.test.ts)
4. Check device logs for deep link parsing errors

**Notifications work on iOS but not Android:**
1. Verify Android notification channel is configured (handled automatically by mobile app)
2. Check Android system notification settings
3. Verify battery optimization isn't blocking notifications

## Related Documentation

- [`docs/deep-linking.md`](./deep-linking.md) — Deep link URL formats and validation
- [`docs/architecture.md`](./architecture.md) — Feature organization and state management
- [Expo Push Notifications](https://docs.expo.dev/push-notifications/overview/) — Official Expo documentation

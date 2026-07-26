/**
 * Push Notifications Types — Notification payloads and preferences
 *
 * Defines the structure of push notification data and user preferences
 * for enabling/disabling push notifications.
 */

/**
 * The type of notification event
 */
export type NotificationType = "role-updated" | "access-granted";

/**
 * Base notification data embedded in the push notification
 */
export interface NotificationData {
  type: NotificationType;
  guildId: string;
  deepLink: string;
}

/**
 * Role update notification data
 */
export interface RoleUpdateNotificationData extends NotificationData {
  type: "role-updated";
  roleName: string;
  action: "added" | "removed";
}

/**
 * Access granted notification data
 */
export interface AccessGrantedNotificationData extends NotificationData {
  type: "access-granted";
  resourceId: string;
  resourceName?: string;
}

/**
 * Union type of all notification data types
 */
export type PushNotificationData = RoleUpdateNotificationData | AccessGrantedNotificationData;

/**
 * User's push notification preferences
 */
export interface PushNotificationPreferences {
  enabled: boolean;
  pushToken?: string;
  lastUpdated: number;
}

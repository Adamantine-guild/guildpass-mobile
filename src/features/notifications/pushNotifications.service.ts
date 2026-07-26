/**
 * Push Notifications Service — Registration and permission handling
 *
 * Handles Expo push notification setup, permission requests, token registration,
 * and notification response handling with deep-link routing.
 */

import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import Constants from "expo-constants";
import type { PushNotificationData } from "./pushNotifications.types";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

/**
 * Configure how notifications are handled when the app is in the foreground
 */
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

// ---------------------------------------------------------------------------
// Permission Management
// ---------------------------------------------------------------------------

/**
 * Check if push notifications are supported on this device
 */
export function isPushNotificationSupported(): boolean {
  return Constants.isDevice && (Platform.OS === "ios" || Platform.OS === "android");
}

/**
 * Request push notification permissions from the user
 * @returns The permission status result
 */
export async function requestNotificationPermissions(): Promise<Notifications.NotificationPermissionsStatus> {
  if (!isPushNotificationSupported()) {
    return {
      status: Notifications.PermissionStatus.DENIED,
      canAskAgain: false,
      granted: false,
      ios: undefined,
      android: undefined,
      expires: undefined,
    };
  }

  const { status: existingStatus } = await Notifications.getPermissionsAsync();

  // If already granted, return immediately
  if (existingStatus === "granted") {
    return {
      status: Notifications.PermissionStatus.GRANTED,
      canAskAgain: false,
      granted: true,
      ios: undefined,
      android: undefined,
      expires: undefined,
    };
  }

  // Request permissions
  const { status } = await Notifications.requestPermissionsAsync({
    ios: {
      allowAlert: true,
      allowBadge: true,
      allowSound: true,
    },
  });

  return {
    status:
      status === "granted"
        ? Notifications.PermissionStatus.GRANTED
        : Notifications.PermissionStatus.DENIED,
    canAskAgain: status === "undetermined",
    granted: status === "granted",
    ios: undefined,
    android: undefined,
    expires: undefined,
  };
}

/**
 * Get the current notification permission status
 */
export async function getNotificationPermissionStatus(): Promise<Notifications.NotificationPermissionsStatus> {
  if (!isPushNotificationSupported()) {
    return {
      status: Notifications.PermissionStatus.DENIED,
      canAskAgain: false,
      granted: false,
      ios: undefined,
      android: undefined,
      expires: undefined,
    };
  }

  return Notifications.getPermissionsAsync();
}

// ---------------------------------------------------------------------------
// Token Registration
// ---------------------------------------------------------------------------

/**
 * Register for push notifications and get the Expo push token
 * @returns The Expo push token or undefined if registration failed
 */
export async function registerForPushNotifications(): Promise<string | undefined> {
  if (!isPushNotificationSupported()) {
    console.warn("Push notifications are not supported on this device");
    return undefined;
  }

  try {
    const { status } = await Notifications.getPermissionsAsync();

    if (status !== "granted") {
      console.warn("Push notification permissions not granted");
      return undefined;
    }

    // Get the Expo push token
    const tokenData = await Notifications.getExpoPushTokenAsync({
      projectId: Constants.expoConfig?.extra?.eas?.projectId,
    });

    // Configure Android notification channel
    if (Platform.OS === "android") {
      await Notifications.setNotificationChannelAsync("default", {
        name: "Default",
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: "#4F46E5", // Indigo color matching GuildPass branding
      });
    }

    return tokenData.data;
  } catch (error) {
    console.error("Failed to register for push notifications:", error);
    return undefined;
  }
}

// ---------------------------------------------------------------------------
// Notification Handling
// ---------------------------------------------------------------------------

/**
 * Subscribe to notification received events (when app is in foreground)
 * @param handler Callback to handle the notification
 * @returns Subscription to remove the listener
 */
export function addNotificationReceivedListener(
  handler: (notification: Notifications.Notification) => void,
): Notifications.Subscription {
  return Notifications.addNotificationReceivedListener(handler);
}

/**
 * Subscribe to notification response events (when user taps notification)
 * @param handler Callback to handle the notification response with deep link
 * @returns Subscription to remove the listener
 */
export function addNotificationResponseListener(
  handler: (response: Notifications.NotificationResponse) => void,
): Notifications.Subscription {
  return Notifications.addNotificationResponseReceivedListener(handler);
}

/**
 * Extract notification data from a notification response
 * @param response The notification response
 * @returns Parsed notification data or null
 */
export function extractNotificationData(
  response: Notifications.NotificationResponse,
): PushNotificationData | null {
  try {
    const data = response.notification.request.content.data as Partial<PushNotificationData>;

    if (!data || !data.type || !data.guildId || !data.deepLink) {
      console.warn("Invalid notification data structure:", data);
      return null;
    }

    // Validate notification type
    if (data.type !== "role-updated" && data.type !== "access-granted") {
      console.warn("Unknown notification type:", data.type);
      return null;
    }

    return data as PushNotificationData;
  } catch (error) {
    console.error("Failed to parse notification data:", error);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Cleanup
// ---------------------------------------------------------------------------

/**
 * Unregister from push notifications and clear the badge
 */
export async function unregisterFromPushNotifications(): Promise<void> {
  try {
    // Clear badge count
    await Notifications.setBadgeCountAsync(0);

    // Clear all delivered notifications
    await Notifications.dismissAllNotificationsAsync();
  } catch (error) {
    console.error("Failed to unregister from push notifications:", error);
  }
}

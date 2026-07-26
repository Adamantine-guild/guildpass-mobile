/**
 * usePushNotifications Hook — React hook for push notification management
 *
 * Provides an interface to enable/disable push notifications, request permissions,
 * and handle notification responses with deep linking.
 */

import { useEffect, useCallback, useRef } from "react";
import { useRouter } from "expo-router";
import { usePushNotificationsStore } from "./pushNotifications.store";
import {
  isPushNotificationSupported,
  requestNotificationPermissions,
  getNotificationPermissionStatus,
  registerForPushNotifications,
  unregisterFromPushNotifications,
  addNotificationReceivedListener,
  addNotificationResponseListener,
  extractNotificationData,
} from "./pushNotifications.service";
import { parseDeepLink } from "../../lib/deepLink";

export function usePushNotifications() {
  const router = useRouter();
  const enabled = usePushNotificationsStore((s) => s.enabled);
  const pushToken = usePushNotificationsStore((s) => s.pushToken);
  const setEnabled = usePushNotificationsStore((s) => s.setEnabled);
  const setPushToken = usePushNotificationsStore((s) => s.setPushToken);
  const clearPreferences = usePushNotificationsStore((s) => s.clearPreferences);

  const isRegistering = useRef(false);

  /**
   * Enable push notifications and request permissions
   */
  const enablePushNotifications = useCallback(async (): Promise<{
    success: boolean;
    error?: string;
  }> => {
    if (!isPushNotificationSupported()) {
      return {
        success: false,
        error: "Push notifications are not supported on this device",
      };
    }

    if (isRegistering.current) {
      return { success: false, error: "Registration already in progress" };
    }

    try {
      isRegistering.current = true;

      // Request permissions
      const permissionStatus = await requestNotificationPermissions();

      if (!permissionStatus.granted) {
        return {
          success: false,
          error: "Push notification permissions were not granted",
        };
      }

      // Register for push notifications and get token
      const token = await registerForPushNotifications();

      if (!token) {
        return {
          success: false,
          error: "Failed to get push notification token",
        };
      }

      // Update store
      setEnabled(true);
      setPushToken(token);

      return { success: true };
    } catch (error) {
      console.error("Failed to enable push notifications:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    } finally {
      isRegistering.current = false;
    }
  }, [setEnabled, setPushToken]);

  /**
   * Disable push notifications
   */
  const disablePushNotifications = useCallback(async (): Promise<void> => {
    try {
      await unregisterFromPushNotifications();
      setEnabled(false);
    } catch (error) {
      console.error("Failed to disable push notifications:", error);
    }
  }, [setEnabled]);

  /**
   * Check current permission status
   */
  const checkPermissionStatus = useCallback(async () => {
    if (!isPushNotificationSupported()) {
      return { granted: false, canAskAgain: false };
    }

    const status = await getNotificationPermissionStatus();
    return {
      granted: status.granted,
      canAskAgain: status.canAskAgain,
    };
  }, []);

  /**
   * Handle notification tap with deep link routing
   */
  const handleNotificationResponse = useCallback(
    (response: any) => {
      const notificationData = extractNotificationData(response);

      if (!notificationData || !notificationData.deepLink) {
        console.warn("No valid deep link in notification");
        return;
      }

      // Parse and validate the deep link
      const deepLinkResult = parseDeepLink(notificationData.deepLink);

      if (deepLinkResult.valid) {
        // Route to the destination screen
        router.push({
          pathname: deepLinkResult.route.pathname,
          params: deepLinkResult.route.params,
        } as never);
      } else {
        console.error("Invalid deep link in notification:", deepLinkResult.error);
        // Route to error screen
        router.push({
          pathname: "/deep-link-error",
          params: { message: deepLinkResult.error },
        } as never);
      }
    },
    [router],
  );

  /**
   * Set up notification listeners
   */
  useEffect(() => {
    if (!enabled || !isPushNotificationSupported()) {
      return;
    }

    // Listen for notifications received while app is in foreground
    const receivedSubscription = addNotificationReceivedListener((notification) => {
      console.log("Notification received:", notification);
      // Optionally handle in-app notification display here
    });

    // Listen for notification taps (when user interacts with notification)
    const responseSubscription = addNotificationResponseListener(handleNotificationResponse);

    return () => {
      receivedSubscription.remove();
      responseSubscription.remove();
    };
  }, [enabled, handleNotificationResponse]);

  return {
    enabled,
    pushToken,
    isSupported: isPushNotificationSupported(),
    enablePushNotifications,
    disablePushNotifications,
    checkPermissionStatus,
    clearPreferences,
  };
}

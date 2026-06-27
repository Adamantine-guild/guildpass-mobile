import * as Notifications from "expo-notifications";
import * as Device from "expo-device";
import Constants from "expo-constants";
import { Platform } from "react-native";
import { useNotificationsStore } from "./notifications.store";
import { useWalletStore } from "../wallet/wallet.store";
import { useEffect } from "react";

export function useNotifications() {
  const {
    pushToken,
    permissionStatus,
    preferences,
    isRegistering,
    error,
    setPushToken,
    setPermissionStatus,
    togglePreference,
    registerToken,
  } = useNotificationsStore();

  const { walletAddress } = useWalletStore();

  const requestPermissions = async () => {
    if (!Device.isDevice) {
      console.warn("Must use physical device for Push Notifications");
      setPermissionStatus("denied");
      return false;
    }

    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    if (existingStatus !== "granted") {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    if (finalStatus !== "granted") {
      setPermissionStatus("denied");
      return false;
    }

    setPermissionStatus("granted");

    try {
      const projectId =
        Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
      const token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
      setPushToken(token);
      return true;
    } catch (e) {
      console.error("Error getting push token", e);
      return false;
    }
  };

  useEffect(() => {
    if (walletAddress && pushToken && permissionStatus === "granted") {
      registerToken(walletAddress);
    }
  }, [walletAddress, pushToken, permissionStatus]);

  return {
    pushToken,
    permissionStatus,
    preferences,
    isRegistering,
    error,
    requestPermissions,
    togglePreference,
  };
}

export async function configureNotifications() {
  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("default", {
      name: "default",
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: "#FF231F7C",
    });
  }

  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
}

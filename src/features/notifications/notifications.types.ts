export type NotificationCategory = "role_changes" | "access_grants" | "membership_updates";

export interface NotificationPreferences {
  role_changes: boolean;
  access_grants: boolean;
  membership_updates: boolean;
}

export type PermissionStatus = "granted" | "denied" | "undetermined";

export interface NotificationState {
  pushToken: string | null;
  permissionStatus: PermissionStatus;
  preferences: NotificationPreferences;
  isRegistering: boolean;
  error: string | null;
}

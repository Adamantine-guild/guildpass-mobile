import { NotificationPreferences } from "./notifications.types";

export interface NotificationsAdapter {
  registerToken(walletAddress: string, token: string): Promise<void>;
  updatePreferences(walletAddress: string, preferences: NotificationPreferences): Promise<void>;
}

/**
 * Mock adapter for push notification registration.
 * Simulates backend interaction until a live endpoint is available.
 */
export const mockNotificationsAdapter: NotificationsAdapter = {
  async registerToken(walletAddress, token) {
    console.log(`[Mock] Registering token for ${walletAddress}: ${token}`);
    return new Promise((resolve) => setTimeout(resolve, 1000));
  },
  async updatePreferences(walletAddress, preferences) {
    console.log(`[Mock] Updating preferences for ${walletAddress}:`, preferences);
    return new Promise((resolve) => setTimeout(resolve, 500));
  },
};

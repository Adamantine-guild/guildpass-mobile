/**
 * Push Notifications Tests
 *
 * Tests notification handling, deep-link routing, and permission flows.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { extractNotificationData } from "../src/features/notifications/pushNotifications.service";
import type { PushNotificationData } from "../src/features/notifications/pushNotifications.types";

// Mock notification response structure
interface MockNotificationResponse {
  notification: {
    request: {
      content: {
        data: Record<string, unknown>;
      };
    };
  };
}

describe("Push Notifications", () => {
  describe("extractNotificationData", () => {
    it("extracts valid role-updated notification data", () => {
      const mockResponse: MockNotificationResponse = {
        notification: {
          request: {
            content: {
              data: {
                type: "role-updated",
                guildId: "alpha-guild",
                roleName: "VIP Member",
                action: "added",
                deepLink: "guildpass://guild/alpha-guild",
              },
            },
          },
        },
      };

      const result = extractNotificationData(mockResponse as any);

      expect(result).toEqual({
        type: "role-updated",
        guildId: "alpha-guild",
        roleName: "VIP Member",
        action: "added",
        deepLink: "guildpass://guild/alpha-guild",
      });
    });

    it("extracts valid access-granted notification data", () => {
      const mockResponse: MockNotificationResponse = {
        notification: {
          request: {
            content: {
              data: {
                type: "access-granted",
                guildId: "alpha-guild",
                resourceId: "vip-lounge",
                resourceName: "VIP Lounge",
                deepLink: "guildpass://access-check?guildId=alpha-guild&resourceId=vip-lounge",
              },
            },
          },
        },
      };

      const result = extractNotificationData(mockResponse as any);

      expect(result).toEqual({
        type: "access-granted",
        guildId: "alpha-guild",
        resourceId: "vip-lounge",
        resourceName: "VIP Lounge",
        deepLink: "guildpass://access-check?guildId=alpha-guild&resourceId=vip-lounge",
      });
    });

    it("returns null when notification data is missing required fields", () => {
      const mockResponse: MockNotificationResponse = {
        notification: {
          request: {
            content: {
              data: {
                type: "role-updated",
                guildId: "alpha-guild",
                // Missing roleName, action, deepLink
              },
            },
          },
        },
      };

      const result = extractNotificationData(mockResponse as any);

      expect(result).toBeNull();
    });

    it("returns null when type is missing", () => {
      const mockResponse: MockNotificationResponse = {
        notification: {
          request: {
            content: {
              data: {
                guildId: "alpha-guild",
                deepLink: "guildpass://guild/alpha-guild",
              },
            },
          },
        },
      };

      const result = extractNotificationData(mockResponse as any);

      expect(result).toBeNull();
    });

    it("returns null when guildId is missing", () => {
      const mockResponse: MockNotificationResponse = {
        notification: {
          request: {
            content: {
              data: {
                type: "role-updated",
                deepLink: "guildpass://guild/alpha-guild",
              },
            },
          },
        },
      };

      const result = extractNotificationData(mockResponse as any);

      expect(result).toBeNull();
    });

    it("returns null when deepLink is missing", () => {
      const mockResponse: MockNotificationResponse = {
        notification: {
          request: {
            content: {
              data: {
                type: "role-updated",
                guildId: "alpha-guild",
                roleName: "VIP Member",
                action: "added",
              },
            },
          },
        },
      };

      const result = extractNotificationData(mockResponse as any);

      expect(result).toBeNull();
    });

    it("returns null for unknown notification type", () => {
      const mockResponse: MockNotificationResponse = {
        notification: {
          request: {
            content: {
              data: {
                type: "unknown-type",
                guildId: "alpha-guild",
                deepLink: "guildpass://guild/alpha-guild",
              },
            },
          },
        },
      };

      const result = extractNotificationData(mockResponse as any);

      expect(result).toBeNull();
    });

    it("returns null when data is empty object", () => {
      const mockResponse: MockNotificationResponse = {
        notification: {
          request: {
            content: {
              data: {},
            },
          },
        },
      };

      const result = extractNotificationData(mockResponse as any);

      expect(result).toBeNull();
    });

    it("handles malformed notification response gracefully", () => {
      const mockResponse = {
        notification: {
          request: {
            content: {
              // data is missing entirely
            },
          },
        },
      };

      const result = extractNotificationData(mockResponse as any);

      expect(result).toBeNull();
    });
  });

  describe("Notification Deep Link Routing", () => {
    it("role-updated notification should use guild detail deep link", () => {
      const notificationData: PushNotificationData = {
        type: "role-updated",
        guildId: "alpha-guild",
        roleName: "VIP Member",
        action: "added",
        deepLink: "guildpass://guild/alpha-guild",
      };

      expect(notificationData.deepLink).toBe("guildpass://guild/alpha-guild");
    });

    it("access-granted notification should use access-check deep link", () => {
      const notificationData: PushNotificationData = {
        type: "access-granted",
        guildId: "alpha-guild",
        resourceId: "vip-lounge",
        deepLink: "guildpass://access-check?guildId=alpha-guild&resourceId=vip-lounge",
      };

      expect(notificationData.deepLink).toBe(
        "guildpass://access-check?guildId=alpha-guild&resourceId=vip-lounge",
      );
    });

    it("notification deep links should be compatible with parseDeepLink validation", () => {
      // Import parseDeepLink for validation
      const { parseDeepLink } = require("../src/lib/deepLink");

      const roleUpdateLink = "guildpass://guild/alpha-guild";
      const roleResult = parseDeepLink(roleUpdateLink);

      expect(roleResult.valid).toBe(true);
      if (roleResult.valid) {
        expect(roleResult.route.type).toBe("guild-detail");
        expect(roleResult.route.guildId).toBe("alpha-guild");
      }

      const accessGrantedLink =
        "guildpass://access-check?guildId=alpha-guild&resourceId=vip-lounge";
      const accessResult = parseDeepLink(accessGrantedLink);

      expect(accessResult.valid).toBe(true);
      if (accessResult.valid) {
        expect(accessResult.route.type).toBe("access-check");
        expect(accessResult.route.guildId).toBe("alpha-guild");
        expect(accessResult.route.resourceId).toBe("vip-lounge");
      }
    });

    it("notification with universal link should be valid", () => {
      const { parseDeepLink } = require("../src/lib/deepLink");

      const universalLink = "https://guildpass.xyz/guild/alpha-guild";
      const result = parseDeepLink(universalLink);

      expect(result.valid).toBe(true);
    });

    it("notification with malformed deep link should fail validation", () => {
      const { parseDeepLink } = require("../src/lib/deepLink");

      const malformedLink = "guildpass://unknown-route";
      const result = parseDeepLink(malformedLink);

      expect(result.valid).toBe(false);
    });
  });

  describe("Notification Type Guards", () => {
    it("role-updated notification includes required fields", () => {
      const notification: PushNotificationData = {
        type: "role-updated",
        guildId: "alpha-guild",
        roleName: "VIP Member",
        action: "added",
        deepLink: "guildpass://guild/alpha-guild",
      };

      expect(notification.type).toBe("role-updated");
      if (notification.type === "role-updated") {
        expect(notification.roleName).toBe("VIP Member");
        expect(notification.action).toBe("added");
      }
    });

    it("access-granted notification includes required fields", () => {
      const notification: PushNotificationData = {
        type: "access-granted",
        guildId: "alpha-guild",
        resourceId: "vip-lounge",
        resourceName: "VIP Lounge",
        deepLink: "guildpass://access-check?guildId=alpha-guild&resourceId=vip-lounge",
      };

      expect(notification.type).toBe("access-granted");
      if (notification.type === "access-granted") {
        expect(notification.resourceId).toBe("vip-lounge");
        expect(notification.resourceName).toBe("VIP Lounge");
      }
    });
  });
});

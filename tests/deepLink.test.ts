import { describe, it, expect } from "vitest";
import { parseDeepLink } from "../src/lib/deepLink";

describe("parseDeepLink", () => {
  describe("Guild Detail Links", () => {
    it("parses valid custom scheme link", () => {
      const result = parseDeepLink("guildpass://guild/alpha-guild");
      expect(result.valid).toBe(true);
      if (result.valid) {
        expect(result.route).toEqual({
          type: "guild-detail",
          guildId: "alpha-guild",
          params: { guildId: "alpha-guild" },
          pathname: "/guilds/alpha-guild",
        });
      }
    });

    it("parses valid custom scheme link with triple slash", () => {
      const result = parseDeepLink("guildpass:///guild/triple-slash-guild");
      expect(result.valid).toBe(true);
      if (result.valid) {
        expect(result.route).toEqual({
          type: "guild-detail",
          guildId: "triple-slash-guild",
          params: { guildId: "triple-slash-guild" },
          pathname: "/guilds/triple-slash-guild",
        });
      }
    });

    it("parses valid universal link", () => {
      const result = parseDeepLink("https://guildpass.xyz/guild/beta-guild");
      expect(result.valid).toBe(true);
      if (result.valid) {
        expect(result.route).toEqual({
          type: "guild-detail",
          guildId: "beta-guild",
          params: { guildId: "beta-guild" },
          pathname: "/guilds/beta-guild",
        });
      }
    });

    it("rejects custom scheme guild detail link missing guildId", () => {
      const result = parseDeepLink("guildpass://guild/");
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.redirectUrl).toBe("/deep-link-error");
        expect(result.error).toContain("Guild detail link requires a valid guildId");
      }
    });

    it("rejects universal link guild detail link missing guildId", () => {
      const result = parseDeepLink("https://guildpass.xyz/guild");
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.redirectUrl).toBe("/deep-link-error");
        expect(result.error).toContain("Guild detail link requires a valid guildId");
      }
    });

    it("rejects guild detail link with whitespace-only guildId", () => {
      const result = parseDeepLink("guildpass://guild/%20");
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.redirectUrl).toBe("/deep-link-error");
      }
    });

    it("handles invalid percent encoding safely without crashing", () => {
      const result = parseDeepLink("guildpass://guild/%FF");
      expect(result.valid).toBe(true);
      if (result.valid) {
        expect(result.route.type).toBe("guild-detail");
        expect(result.route.guildId).toBe("%FF");
      }
    });
  });

  describe("Access Check Links", () => {
    const validWallet = "0x1234567890123456789012345678901234567890";
    const validMixedWallet = "0xAbCdEf1234567890aBcDeF1234567890aBcDeF12";

    it("parses valid custom scheme link without walletAddress", () => {
      const result = parseDeepLink(
        "guildpass://access-check?guildId=alpha-guild&resourceId=vip-door",
      );
      expect(result.valid).toBe(true);
      if (result.valid) {
        expect(result.route).toEqual({
          type: "access-check",
          guildId: "alpha-guild",
          resourceId: "vip-door",
          params: {
            guildId: "alpha-guild",
            resourceId: "vip-door",
          },
          pathname: "/access-check",
        });
      }
    });

    it("parses valid universal link without walletAddress", () => {
      const result = parseDeepLink(
        "https://guildpass.xyz/access-check?guildId=alpha-guild&resourceId=vip-door",
      );
      expect(result.valid).toBe(true);
      if (result.valid) {
        expect(result.route).toEqual({
          type: "access-check",
          guildId: "alpha-guild",
          resourceId: "vip-door",
          params: {
            guildId: "alpha-guild",
            resourceId: "vip-door",
          },
          pathname: "/access-check",
        });
      }
    });

    it("parses valid custom scheme link with valid walletAddress and normalizes it", () => {
      const result = parseDeepLink(
        `guildpass://access-check?guildId=alpha-guild&resourceId=vip-door&walletAddress=${validMixedWallet}`,
      );
      expect(result.valid).toBe(true);
      if (result.valid) {
        expect(result.route).toEqual({
          type: "access-check",
          guildId: "alpha-guild",
          resourceId: "vip-door",
          walletAddress: validMixedWallet.toLowerCase(),
          params: {
            guildId: "alpha-guild",
            resourceId: "vip-door",
            walletAddress: validMixedWallet.toLowerCase(),
          },
          pathname: "/access-check",
        });
      }
    });

    it("parses valid universal link with valid walletAddress", () => {
      const result = parseDeepLink(
        `https://guildpass.xyz/access-check?guildId=alpha-guild&resourceId=vip-door&walletAddress=${validWallet}`,
      );
      expect(result.valid).toBe(true);
      if (result.valid) {
        expect(result.route).toEqual({
          type: "access-check",
          guildId: "alpha-guild",
          resourceId: "vip-door",
          walletAddress: validWallet.toLowerCase(),
          params: {
            guildId: "alpha-guild",
            resourceId: "vip-door",
            walletAddress: validWallet.toLowerCase(),
          },
          pathname: "/access-check",
        });
      }
    });

    it("rejects access check link missing guildId", () => {
      const result = parseDeepLink("guildpass://access-check?resourceId=vip-door");
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.redirectUrl).toBe("/deep-link-error");
        expect(result.error).toContain("guildId and resourceId");
      }
    });

    it("rejects access check link missing resourceId", () => {
      const result = parseDeepLink("guildpass://access-check?guildId=alpha-guild");
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.redirectUrl).toBe("/deep-link-error");
        expect(result.error).toContain("guildId and resourceId");
      }
    });

    it("rejects access check link missing both parameters", () => {
      const result = parseDeepLink("guildpass://access-check");
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.redirectUrl).toBe("/deep-link-error");
      }
    });

    it("rejects access check link with empty or whitespace-only params", () => {
      const result = parseDeepLink("guildpass://access-check?guildId=%20&resourceId=vip-door");
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.redirectUrl).toBe("/deep-link-error");
      }
    });

    it("rejects access check link with invalid walletAddress format", () => {
      const result = parseDeepLink(
        "guildpass://access-check?guildId=alpha-guild&resourceId=vip-door&walletAddress=0xinvalid",
      );
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.redirectUrl).toBe("/deep-link-error");
        expect(result.error).toContain("Invalid wallet address");
      }
    });

    it("ignores empty walletAddress parameter and succeeds", () => {
      const result = parseDeepLink(
        "guildpass://access-check?guildId=alpha-guild&resourceId=vip-door&walletAddress=",
      );
      expect(result.valid).toBe(true);
      if (result.valid) {
        expect(result.route.type).toBe("access-check");
        if (result.route.type === "access-check") {
          expect(result.route.walletAddress).toBeUndefined();
        }
      }
    });
  });

  describe("Invalid Schemes, Domains, Paths and Input Errors", () => {
    it("handles null, undefined, or empty strings", () => {
      expect(parseDeepLink(null)).toEqual({
        valid: false,
        error: "Deep link URL is empty or undefined.",
        redirectUrl: "/deep-link-error",
      });
      expect(parseDeepLink(undefined)).toEqual({
        valid: false,
        error: "Deep link URL is empty or undefined.",
        redirectUrl: "/deep-link-error",
      });
      expect(parseDeepLink("   ")).toEqual({
        valid: false,
        error: "Deep link URL is empty or undefined.",
        redirectUrl: "/deep-link-error",
      });
    });

    it("handles malformed URLs", () => {
      const result = parseDeepLink("http://[invalid-url");
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.redirectUrl).toBe("/deep-link-error");
        expect(result.error).toContain("Malformed URL");
      }
    });

    it("rejects unsupported schemes", () => {
      const result = parseDeepLink("ftp://guildpass.xyz/guild/alpha-guild");
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.redirectUrl).toBe("/deep-link-error");
        expect(result.error).toContain("Unsupported scheme");
      }
    });

    it("rejects universal links from invalid domains", () => {
      const result = parseDeepLink("https://malicious.com/guild/alpha-guild");
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.redirectUrl).toBe("/deep-link-error");
        expect(result.error).toContain("Invalid domain");
      }
    });

    it("rejects unknown deep link paths", () => {
      const result = parseDeepLink("guildpass://unknown-route");
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.redirectUrl).toBe("/deep-link-error");
        expect(result.error).toContain("Unknown deep link path");
      }
    });
  });
});

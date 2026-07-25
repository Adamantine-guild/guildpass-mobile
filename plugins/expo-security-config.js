/**
 * Expo Config Plugin — GuildPass Security Hardening
 *
 * This plugin integrates device integrity checks and certificate pinning
 * into the native build configuration.
 *
 * ## What it does
 *
 * ### Android
 * - Adds `android:networkSecurityConfig` to the AndroidManifest.xml,
 *   referencing the pinned network_security_config.xml.
 * - (Future) Injects root-detection native code via a library dependency.
 *
 * ### iOS
 * - NSAppTransportSecurity with NSPinnedDomains is configured via
 *   app.json's `ios.infoPlist` — this plugin validates its presence.
 * - (Future) Injects jailbreak-detection native code via a CocoaPod.
 *
 * ## Usage
 *
 * Add to app.json plugins array:
 * ```json
 * { "plugins": ["./plugins/expo-security-config"] }
 * ```
 *
 * ## References
 * - docs/threat-model.md
 * - docs/pin-rotation-runbook.md
 */

const { withAndroidManifest } = require("@expo/config-plugins");

/**
 * @param {import("@expo/config-plugins").ExportedConfig} config
 * @returns {import("@expo/config-plugins").ExportedConfig}
 */
function withGuildPassSecurity(config) {
  // -- Android: Network Security Config --
  config = withAndroidManifest(config, (config) => {
    const manifest = config.modResults;

    // Ensure the <application> element has android:networkSecurityConfig
    const app = manifest.manifest.application?.[0];
    if (app) {
      const existingNetworkConfig = app.$?.["android:networkSecurityConfig"];

      if (!existingNetworkConfig) {
        app.$ = app.$ || {};
        app.$["android:networkSecurityConfig"] = "@xml/network_security_config";
        console.log(
          "[GuildPass Security] Added android:networkSecurityConfig to AndroidManifest.xml",
        );
      } else {
        console.log(
          `[GuildPass Security] android:networkSecurityConfig already set to: ${existingNetworkConfig}`,
        );
      }

      // Ensure cleartext traffic is disabled (defense-in-depth)
      if (app.$["android:usesCleartextTraffic"] === undefined) {
        app.$["android:usesCleartextTraffic"] = "false";
        console.log("[GuildPass Security] Set android:usesCleartextTraffic=false");
      }
    }

    return config;
  });

  // -- iOS: Validate ATS pinning configuration --
  const iosConfig = config.ios || {};
  const infoPlist = iosConfig.infoPlist || {};
  const ats = infoPlist.NSAppTransportSecurity;

  if (!ats || !ats.NSPinnedDomains) {
    console.warn(
      "[GuildPass Security] WARNING: NSAppTransportSecurity with NSPinnedDomains " +
        "is not configured in app.json ios.infoPlist. Certificate pinning will " +
        "NOT be enforced on iOS.",
    );
  } else {
    const pinnedDomains = Object.keys(ats.NSPinnedDomains || {});
    console.log(`[GuildPass Security] iOS ATS pinning configured for: ${pinnedDomains.join(", ")}`);
  }

  return config;
}

module.exports = withGuildPassSecurity;

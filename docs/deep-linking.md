# Deep Linking

This document explains how universal links (iOS) and app links (Android) are
configured in GuildPass, and how to verify that the required association files
are deployed correctly on the guildpass.xyz domain.

## Overview

GuildPass can open guildpass.xyz links directly in the mobile app instead of the
browser. Two platform mechanisms make this work:

- iOS Universal Links, backed by an Apple App Site Association (AASA) file.
- Android App Links, backed by a Digital Asset Links file (assetlinks.json).

The app declares the association in app.json:

    "ios": {
      "bundleIdentifier": "xyz.guildpass.mobile",
      "associatedDomains": ["applinks:guildpass.xyz"]
    },
    "android": {
      "package": "xyz.guildpass.mobile",
      "intentFilters": [ { "autoVerify": true, "data": [{ "host": "guildpass.xyz" }] } ]
    }

For links to actually open the app, the guildpass.xyz web server must serve
matching association files. If those files are missing or malformed, deep links
silently fall back to the browser.

## Required server files

### iOS

Served at:

    https://guildpass.xyz/.well-known/apple-app-site-association

- Must be valid JSON (no file extension, served as application/json).
- Must include an appID ending with the iOS bundle id xyz.guildpass.mobile. The
  fully-qualified value is TEAMID.xyz.guildpass.mobile, where TEAMID is the Apple
  Developer Team ID.

Example:

    {
      "applinks": {
        "details": [
          {
            "appIDs": ["ABCDE12345.xyz.guildpass.mobile"],
            "components": [{ "/": "/guild/*" }, { "/": "/access-check" }]
          }
        ]
      }
    }

### Android

Served at:

    https://guildpass.xyz/.well-known/assetlinks.json

- Must be valid JSON, served as application/json.
- Must contain a statement for package_name xyz.guildpass.mobile with at least
  one entry in sha256_cert_fingerprints (the signing certificate fingerprint).

Example:

    [
      {
        "relation": ["delegate_permission/common.handle_all_urls"],
        "target": {
          "namespace": "android_app",
          "package_name": "xyz.guildpass.mobile",
          "sha256_cert_fingerprints": ["AA:BB:CC:DD:..."]
        }
      }
    ]

## Verifying the configuration

Run the verifier from the repo root:

    node scripts/verify-deep-links.mjs

Or, once it is wired into package.json scripts:

    pnpm verify:deep-links

The script reads the expected identifiers from app.json, fetches the live
association files from guildpass.xyz, and checks that:

- Each file is reachable and returns valid JSON.
- The iOS AASA lists an appID matching the bundle id.
- The Android assetlinks.json lists the package with at least one SHA-256
  fingerprint.

It prints notes for warnings (for example an unexpected content-type) and exits
with a non-zero status if any required check fails, so it can be used as a gate
in CI. It relies only on built-in Node features, so no extra dependencies are
required to run it.

### Optional strict checks

    node scripts/verify-deep-links.mjs --strict --team-id=ABCDE12345 --android-sha256=AA:BB:CC:DD:...

- --strict turns on the extra assertions below.
- --team-id checks that the AASA lists the exact fully-qualified appID
  TEAMID.bundleId.
- --android-sha256 checks that assetlinks.json lists that exact certificate
  fingerprint.

## Troubleshooting

- "Unexpected token" / DOCTYPE in the error: the server returned an HTML page
  (often a 404 or single-page-app fallback) instead of the association file.
  Deploy the file at the exact path shown above.
- iOS link opens the browser: confirm the AASA is served over HTTPS with no
  redirects and that the Team ID prefix is correct.
- Android link opens the browser: confirm the SHA-256 fingerprint matches the
  certificate used to sign the installed build.

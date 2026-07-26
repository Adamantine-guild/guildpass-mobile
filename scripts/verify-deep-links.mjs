import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(scriptDir, "..");

function readArg(name) {
  const prefix = "--" + name + "=";
  const match = process.argv.find(function (a) {
    return a.indexOf(prefix) === 0;
  });
  return match ? match.slice(prefix.length) : null;
}

function hasFlag(name) {
  return process.argv.indexOf("--" + name) !== -1;
}

const strict = hasFlag("strict");
const expectedTeamId = readArg("team-id");
const expectedAndroidSha = readArg("android-sha256");

const failures = [];
const notes = [];

function fail(message) {
  failures.push(message);
}

function note(message) {
  notes.push(message);
}

let appConfig;
try {
  const raw = readFileSync(join(repoRoot, "app.json"), "utf8");
  appConfig = JSON.parse(raw);
} catch (error) {
  console.error("Could not read or parse app.json: " + error.message);
  process.exit(1);
}

const expo = appConfig.expo || appConfig || {};
const ios = expo.ios || {};
const android = expo.android || {};
const associatedDomains = ios.associatedDomains || [];

const applinksEntry = associatedDomains.find(function (entry) {
  return typeof entry === "string" && entry.indexOf("applinks:") === 0;
});
const domain = applinksEntry ? applinksEntry.slice("applinks:".length) : null;
const iosBundleId = ios.bundleIdentifier || null;
const androidPackage = android.package || null;

if (!domain) {
  fail("No applinks domain found in expo.ios.associatedDomains in app.json.");
}
if (!iosBundleId) {
  fail("No expo.ios.bundleIdentifier found in app.json.");
}
if (!androidPackage) {
  fail("No expo.android.package found in app.json.");
}

async function fetchJson(url) {
  const result = {
    url: url,
    ok: false,
    status: 0,
    contentType: "",
    json: null,
    error: null,
  };
  try {
    const response = await fetch(url, { redirect: "follow" });
    result.status = response.status;
    result.contentType = response.headers.get("content-type") || "";
    const text = await response.text();
    if (!response.ok) {
      result.error = "HTTP " + response.status;
      return result;
    }
    try {
      result.json = JSON.parse(text);
      result.ok = true;
    } catch (parseError) {
      result.error = "invalid JSON (" + parseError.message + ")";
    }
  } catch (networkError) {
    result.error = "request failed (" + networkError.message + ")";
  }
  return result;
}

function collectAppleAppIds(aasa) {
  const ids = [];
  if (!aasa || !aasa.applinks) {
    return ids;
  }
  const details = aasa.applinks.details || [];
  details.forEach(function (detail) {
    if (Array.isArray(detail.appIDs)) {
      detail.appIDs.forEach(function (id) {
        ids.push(id);
      });
    }
    if (typeof detail.appID === "string") {
      ids.push(detail.appID);
    }
  });
  return ids;
}

async function checkApple() {
  if (!domain || !iosBundleId) {
    return;
  }
  const wellKnownUrl = "https://" + domain + "/.well-known/apple-app-site-association";
  const legacyUrl = "https://" + domain + "/apple-app-site-association";

  let result = await fetchJson(wellKnownUrl);
  if (!result.ok) {
    note(
      "Apple AASA not valid at " +
        wellKnownUrl +
        " (" +
        result.error +
        "); trying legacy root path.",
    );
    const legacy = await fetchJson(legacyUrl);
    if (legacy.ok) {
      result = legacy;
    } else {
      fail(
        "Apple App Site Association not reachable or valid at " +
          wellKnownUrl +
          " or " +
          legacyUrl +
          " (last error: " +
          legacy.error +
          ").",
      );
      return;
    }
  }

  if (result.contentType.indexOf("application/json") === -1) {
    note(
      'Apple AASA content-type is "' + result.contentType + '"; application/json is recommended.',
    );
  }

  const appIds = collectAppleAppIds(result.json);
  const bundleMatch = appIds.some(function (appId) {
    return appId === iosBundleId || appId.endsWith("." + iosBundleId);
  });
  if (!bundleMatch) {
    fail(
      'Apple AASA does not list an appID ending with the iOS bundle id "' +
        iosBundleId +
        '" (found: ' +
        (appIds.length ? appIds.join(", ") : "none") +
        ").",
    );
  } else {
    note('Apple AASA lists the iOS bundle id "' + iosBundleId + '".');
  }

  if (strict && expectedTeamId) {
    const teamMatch = appIds.some(function (appId) {
      return appId === expectedTeamId + "." + iosBundleId;
    });
    if (!teamMatch) {
      fail(
        'Apple AASA does not list the fully-qualified appID "' +
          expectedTeamId +
          "." +
          iosBundleId +
          '".',
      );
    }
  }
}

async function checkAndroid() {
  if (!domain || !androidPackage) {
    return;
  }
  const url = "https://" + domain + "/.well-known/assetlinks.json";
  const result = await fetchJson(url);
  if (!result.ok) {
    fail(
      "Android Digital Asset Links not reachable or valid at " + url + " (" + result.error + ").",
    );
    return;
  }
  if (result.contentType.indexOf("application/json") === -1) {
    note(
      'Android assetlinks content-type is "' +
        result.contentType +
        '"; application/json is recommended.',
    );
  }

  const statements = Array.isArray(result.json) ? result.json : [];
  let packageFound = false;
  let fingerprints = [];
  statements.forEach(function (statement) {
    const target = statement && statement.target;
    if (target && target.package_name === androidPackage) {
      packageFound = true;
      if (Array.isArray(target.sha256_cert_fingerprints)) {
        fingerprints = fingerprints.concat(target.sha256_cert_fingerprints);
      }
    }
  });

  if (!packageFound) {
    fail('Android assetlinks.json has no statement for package "' + androidPackage + '".');
    return;
  }
  note('Android assetlinks.json contains the package "' + androidPackage + '".');

  if (fingerprints.length === 0) {
    fail(
      'Android assetlinks.json statement for "' +
        androidPackage +
        '" has no sha256_cert_fingerprints.',
    );
  }

  if (strict && expectedAndroidSha) {
    const normalized = expectedAndroidSha.toUpperCase();
    const shaMatch = fingerprints.some(function (fp) {
      return fp.toUpperCase() === normalized;
    });
    if (!shaMatch) {
      fail("Android assetlinks.json does not list the expected SHA-256 fingerprint.");
    }
  }
}

async function main() {
  console.log("Verifying deep link associations");
  console.log("  domain: " + (domain || "unknown"));
  console.log("  iOS bundle id: " + (iosBundleId || "unknown"));
  console.log("  Android package: " + (androidPackage || "unknown"));
  console.log("");

  if (domain) {
    await checkApple();
    await checkAndroid();
  }

  notes.forEach(function (message) {
    console.log("note: " + message);
  });

  if (failures.length > 0) {
    console.error("");
    failures.forEach(function (message) {
      console.error("FAIL: " + message);
    });
    console.error("");
    console.error("Deep link association check FAILED with " + failures.length + " problem(s).");
    process.exit(1);
  }

  console.log("");
  console.log("Deep link association check PASSED.");
  process.exit(0);
}

main().catch(function (error) {
  console.error("Unexpected error: " + error.message);
  process.exit(1);
});

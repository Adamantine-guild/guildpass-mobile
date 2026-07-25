# Certificate / Public-Key Pin Rotation Runbook

> **Target audience:** DevOps, platform engineers, and mobile release managers responsible for GuildPass API TLS certificate lifecycle.

## Overview

GuildPass Mobile enforces certificate (public-key) pinning for all traffic to `api.guildpass.xyz` and `staging.guildpass.xyz`. This means the app will **reject** TLS connections if the server presents a certificate whose public key is not in the app's trusted pin set.

**If pins are not rotated before the server certificate changes, all mobile clients will lose connectivity** — users will be unable to access guild data, scan access codes, or use any API-dependent feature.

This runbook describes the safe rotation procedure to avoid bricking connectivity.

---

## Background: How Pinning Works

The app ships with a set of **SubjectPublicKeyInfo (SPKI) SHA-256 hashes** (base64-encoded). At connection time:

| Platform     | Mechanism                                                                                                            |
| ------------ | -------------------------------------------------------------------------------------------------------------------- |
| **Android**  | `network_security_config.xml` (via `android:networkSecurityConfig` in the manifest)                                  |
| **iOS**      | `NSAppTransportSecurity` with `NSPinnedDomains` in `Info.plist`                                                      |
| **JS layer** | `src/features/security/certificatePinning.ts` — defines the canonical pin set; native config is generated from this. |

The pin set is defined in `src/features/security/certificatePinning.ts` under the `CURRENT_PINS` constant.

---

## Pre-requisites

- [ ] Access to the GuildPass API server or its TLS certificate files
- [ ] OpenSSL CLI tools installed
- [ ] Access to this repository with write permissions
- [ ] Access to EAS Build for releasing a new binary
- [ ] At least **2 weeks** before certificate expiry

---

## Step-by-Step Rotation Procedure

### Phase 1: Obtain the New Public Key Hash (14+ days before expiry)

1. **Retrieve the new certificate's public key:**

   ```bash
   # From a live server (replace with actual domain):
   openssl s_client -connect api.guildpass.xyz:443 -servername api.guildpass.xyz </dev/null 2>/dev/null \
     | openssl x509 -pubkey -noout \
     | openssl pkey -pubin -outform der \
     | openssl dgst -sha256 -binary \
     | openssl base64
   ```

   Or from a certificate file:

   ```bash
   openssl x509 -in /path/to/new-cert.pem -pubkey -noout \
     | openssl pkey -pubin -outform der \
     | openssl dgst -sha256 -binary \
     | openssl base64
   ```

2. **Save the output.** It looks like: `a1B2c3D4e5F6g7H8i9J0kLmNoPqRsTuVwXyZ...=`

---

### Phase 2: Add the New Pin (BEFORE the old one is removed)

1. Open `src/features/security/certificatePinning.ts`.
2. Add a new entry to `CURRENT_PINS`:

   ```typescript
   {
     hash: "NEW_HASH_HERE",
     label: "guildpass-primary-2027",
     addedAt: "2027-01-15T00:00:00Z",
     expiresAt: "2028-01-15T00:00:00Z",
   },
   ```

3. **Keep the old pin(s) in place.** The app will now trust BOTH the old and new keys.
4. Run validation:

   ```bash
   npx ts-node -e "
   const { validatePinConfiguration } = require('./src/features/security/certificatePinning');
   console.log(validatePinConfiguration());
   "
   ```

5. Commit and create a new build:

   ```bash
   git add src/features/security/certificatePinning.ts
   git commit -m "feat(security): add new certificate pin for 2027 rotation"
   git push
   eas build --platform all --profile production
   ```

6. **Force-update all users** to this new binary via EAS Update or app store update.

---

### Phase 3: Deploy the New Certificate on the Server

1. Deploy the new TLS certificate to `api.guildpass.xyz`.
2. Verify connectivity from a build with both pins:

   ```bash
   # Using the app built in Phase 2, verify all API calls succeed.
   ```

3. Monitor for any pin-failure reports for at least **48 hours**.

---

### Phase 4: Remove the Old Pin (AFTER all users have updated)

1. **Verify adoption**: Ensure >95% of users are on the build from Phase 2.
2. Remove the old (expired) pin entry from `CURRENT_PINS`.
3. Update the label of the new pin to `"guildpass-primary-2027"`.
4. Generate a new backup pin for the NEXT rotation cycle and add it.
5. Commit:

   ```bash
   git add src/features/security/certificatePinning.ts
   git commit -m "feat(security): remove expired pin, add next backup"
   git push
   eas build --platform all --profile production
   ```

---

## Emergency: Connectivity Bricked

If pins are not rotated in time and clients lose connectivity:

1. **Immediate mitigation:** The app's pinning is configured with `failOpen: false`. If the server certificate changes and the pin set is stale, the only recovery path is a new binary release.
2. **Roll back the server certificate** to the previous one (if still valid) to restore service while a fixed build is prepared.
3. **Expedited build:** Follow Phase 1-2 above and release via emergency app store review.

> ⚠️ **Prevention is the only reliable strategy.** Always have a backup pin and rotate proactively.

---

## Validation Checklist

| Step | Description                                                | ✅  |
| ---- | ---------------------------------------------------------- | --- |
| 1    | New pin hash obtained via OpenSSL                          |     |
| 2    | New pin entry added to `CURRENT_PINS` (old pin retained)   |     |
| 3    | `validatePinConfiguration()` returns `{ valid: true }`     |     |
| 4    | Build succeeds on both platforms                           |     |
| 5    | App connects to API with old certificate (backward compat) |     |
| 6    | App connects to API with new certificate (forward compat)  |     |
| 7    | MITM proxy with non-pinned cert is correctly rejected      |     |
| 8    | Old pin removed only after >95% user adoption              |     |
| 9    | New backup pin added for next rotation cycle               |     |

---

## Schedule

| Frequency          | Action                                                  |
| ------------------ | ------------------------------------------------------- |
| **Annually**       | Primary pin rotation (aligned with certificate renewal) |
| **Every 6 months** | Review pin set validity, check certificate expiry dates |
| **On incident**    | Emergency rotation per Phase 1-2 (expedited)            |

---

## Related Documents

- [Threat Model](./threat-model.md) — scope and limitations of this hardening
- [SECURITY.md](../SECURITY.md) — vulnerability reporting and security policy
- `src/features/security/certificatePinning.ts` — canonical pin set definition

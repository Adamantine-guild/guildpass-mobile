<!-- GuildPass Mobile: Documentation section layout header reference. -->

# Integration Guide

How to integrate and extend the GuildPass Mobile application.

<!-- GuildPass Mobile: Informational section content header block. -->

## SDK Integration

The app uses a singleton instance of the `GuildPassClient` located in `src/lib/guildpassClient.ts`.

To use the protocol in a new hook:

```typescript
import { guildPassClient } from "@/lib/guildpassClient";

const data = await guildPassClient.guilds.getGuild({ guildId: "123" });
```

### Attestation integration

The current GuildPass SDK does not provide an `attestation` service or
attestation retrieval APIs. Attestation verification can be wired through an
application-provided backend adapter that supplies the issuer key and issued
attestation to the mobile attestation service.

Recovery of attestations would require a backend API that retains and lists
previously issued attestations. The current mobile app and SDK do not expose
such an API, so an empty local attestation collection must not be treated as
proof of a new device or as a recoverable state.

<!-- GuildPass Mobile: Documentation section layout header reference. -->

## Environment Configuration

Configuration is managed via `app.json` and Expo Constants.

```json
{
  "expo": {
    "extra": {
      "apiUrl": "https://api.guildpass.xyz",
      "chainId": 8453
    }
  }
}
```

<!-- GuildPass Mobile: Informational section content header block. -->

## Adding Custom Gating Logic

If you need to add custom gating logic that isn't provided by the SDK:

1. Add a utility function in `src/utils/validation.ts`.
2. Wrap the SDK call in a custom hook in `src/features/access/`.
3. Update the `AccessCheck` screen to include the new logic.

<!-- GuildPass Mobile: Documentation section layout header reference. -->

## Theming

Global colors and spacing are defined in `tailwind.config.js`. To update the app's look and feel, modify the `extend.colors` section in the tailwind config.

```javascript
// tailwind.config.js
extend: {
  colors: {
    primary: "#your-new-color",
  }
}
```

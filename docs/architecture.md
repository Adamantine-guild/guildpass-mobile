<!-- GuildPass Mobile: Documentation section layout header reference. -->

# Mobile App Architecture

GuildPass Mobile follows a feature-based architecture combined with Expo Router for navigation.

<!-- GuildPass Mobile: Informational section content header block. -->

## Navigation & Routing

We use **Expo Router**, which provides file-system based routing similar to Next.js.

- `app/_layout.tsx`: Root layout provider (QueryClient, Providers).
- `app/index.tsx`: Initial entry point with redirect logic.
- `app/onboarding.tsx`: User welcome and intro.
- `app/profile.tsx`: Main wallet/account management.
- `app/guilds/`: Guild listing and detail views.

<!-- GuildPass Mobile: Documentation section layout header reference. -->

## State Management

1. **Server State**: Managed by **React Query**. All protocol data (guilds, memberships, access) is fetched and cached here.
2. **Global Client State**: Managed by **Zustand**. Used for lightweight UI state like the connected wallet address.
3. **Local State**: Standard React `useState` for form inputs and transient UI toggles.

<!-- GuildPass Mobile: Informational section content header block. -->

## Feature Organization

The `src/features/` directory is organized by domain:

- `wallet/`: Logic for connecting and managing the user's wallet address.
- `guilds/`: API wrappers and hooks for guild metadata.
- `membership/`: Hooks for checking user-specific membership data.
- `access/`: Logic for the access check protocol.
- `auth/`: SIWE (EIP-4361) message build/parse, the token-exchange client, and the
  bearer + 401 silent-refresh fetch wrapper.
- `session/`: The proven session: SIWE adapter, rotating refresh-token storage,
  and the zustand session store.

<!-- GuildPass Mobile: Informational section content header block. -->

## Authentication & session model

Sessions are proven by a Sign-In With Ethereum (EIP-4361) signature, not by a
client-asserted address. The full flow, security properties, and the SDK
coordination contract are documented in
[`docs/siwe-session-architecture.md`](./siwe-session-architecture.md). In short:

- Membership / role / access queries use the **authenticated session address** and
  a bearer token; a query for a different address is rejected.
- Access tokens are short-lived; refresh tokens **rotate** on every refresh and are
  **revoked on logout**.
- See `SECURITY.md` for the threat model.

Each feature typically contains:

- `*.api.ts`: SDK wrapper functions.
- `*.types.ts`: Domain-specific TypeScript interfaces.
- `use*.ts`: Custom hooks for UI components.

<!-- GuildPass Mobile: Documentation section layout header reference. -->

## UI & Styling

We use **NativeWind**, which allows us to use Tailwind CSS classes directly in React Native components. This ensures:

- Consistent design system across platforms.
- Faster development cycle.
- Highly readable component code.

<!-- GuildPass Mobile: Informational section content header block. -->

## Future Wallet Integration Path

The current MVP uses a manual address entry. The architecture is designed to easily swap this with:

1. `WalletConnect`: Using `@web3modal/react-native`.
2. `Expo-standard wallets`: Using `expo-linking` for deep-linking into wallet apps.
3. `Embedded Wallets`: Integration with social-login based wallets for non-crypto-native users.

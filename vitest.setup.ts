import { resolve } from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

try {
  require.resolve("@guildpass/sdk");
} catch {
  const shimPath = resolve(__dirname, "tests/fixtures/guildpass-sdk-shim.ts");
  const alias = {
    "@guildpass/sdk": shimPath,
  };

  // Vitest can use the Vite resolve.alias config from vitest.config.ts.
  // We intentionally leave this as a no-op so the runtime can fall back to the shim when needed.
  if (process.env.VITEST) {
    // noop
  }
}

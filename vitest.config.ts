import { defineConfig } from "vitest/config";
import path from "path";

/**
 * Vitest configuration for GuildPass Mobile.
 *
 * Environment: "node" – the feature-hook tests don't need a DOM or RN bridge.
 * Component tests (tests/components.test.tsx) use @testing-library/react-native
 * which works in the node environment via react-test-renderer.
 *
 * Path aliases mirror tsconfig.json so imports using "@/" resolve correctly.
 *
 * The `@guildpass/sdk` alias points at a local stub. The published SDK is shipped
 * as GitHub source without a built `dist/`, so resolving the real package entry
 * fails in the test runner. Every test that touches the SDK also `vi.mock`s it
 * with the shared factory in tests/fixtures/sdk.mock.ts, so the stub only needs
 * to be resolvable; it is never executed in those tests. It is functional enough
 * to back the real `guildPassClient` singleton if a test does NOT mock the SDK.
 */
export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    setupFiles: ["tests/setup.ts"],
    // Collect coverage from src only, exclude generated files
    coverage: {
      include: ["src/**/*.ts", "src/**/*.tsx"],
      exclude: ["src/**/*.d.ts"],
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
      "@guildpass/sdk": path.resolve(__dirname, "tests/fixtures/sdk.stub.ts"),
    },
  },
});

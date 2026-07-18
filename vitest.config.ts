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
      "@guildpass/sdk": path.resolve(__dirname, "tests/fixtures/guildpass-sdk-shim.ts"),
    },
  },
});

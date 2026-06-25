const { defineConfig } = require("vitest/config");

module.exports = defineConfig({
  test: {
    globals: true,
    environment: "node",
    exclude: [
      "**/node_modules/**",
      "**/dist/**",
      "**/api.test.ts",
      "**/components.test.tsx",
      "**/accessScanner.test.tsx",
    ],
  },
});

import React from "react";
import { Text } from "react-native";
import TestRenderer, { act } from "react-test-renderer";
import { describe, expect, it, vi } from "vitest";
import { SensitiveStorageMigrationGate } from "../src/features/security/SensitiveStorageMigrationGate";

vi.mock("react-native", () => ({
  View: "View",
  Text: "Text",
  Pressable: "Pressable",
  ActivityIndicator: "ActivityIndicator",
}));

const successfulReport = {
  migratedKeys: [],
  clearedKeys: [],
  failedKeys: [],
};

describe("SensitiveStorageMigrationGate", () => {
  it("renders children only after a clean migration report", async () => {
    const migrate = vi.fn().mockResolvedValue(successfulReport);
    let renderer!: TestRenderer.ReactTestRenderer;

    await act(async () => {
      renderer = TestRenderer.create(
        <SensitiveStorageMigrationGate migrate={migrate}>
          <Text>Protected application</Text>
        </SensitiveStorageMigrationGate>,
      );
    });

    expect(JSON.stringify(renderer.toJSON())).toContain("Protected application");
  });

  it("keeps children blocked after failed cleanup and permits a verified retry", async () => {
    const migrate = vi
      .fn()
      .mockResolvedValueOnce({
        migratedKeys: [],
        clearedKeys: [],
        failedKeys: ["wallet-storage"],
      })
      .mockResolvedValueOnce(successfulReport);
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    let renderer!: TestRenderer.ReactTestRenderer;

    try {
      await act(async () => {
        renderer = TestRenderer.create(
          <SensitiveStorageMigrationGate migrate={migrate}>
            <Text>Protected application</Text>
          </SensitiveStorageMigrationGate>,
        );
      });

      expect(JSON.stringify(renderer.toJSON())).not.toContain("Protected application");
      expect(
        renderer.root.findByProps({ testID: "sensitive-storage-migration-error" }),
      ).toBeDefined();

      await act(async () => {
        renderer.root.findByProps({ testID: "sensitive-storage-migration-retry" }).props.onPress();
      });

      expect(migrate).toHaveBeenCalledTimes(2);
      expect(JSON.stringify(renderer.toJSON())).toContain("Protected application");
    } finally {
      consoleError.mockRestore();
    }
  });
});

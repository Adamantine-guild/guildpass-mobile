import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { describe, expect, it, vi } from "vitest";
import { Button } from "../src/components/Button";
import { Card } from "../src/components/Card";
import { Text } from "react-native";

vi.mock("react-native", () => ({
  View: "View",
  Text: "Text",
  TouchableOpacity: "TouchableOpacity",
  ActivityIndicator: "ActivityIndicator",
}));

describe("Core Components", () => {
  describe("Button", () => {
    it("renders correctly and handles press", () => {
      const onPress = vi.fn();
      const renderer = TestRenderer.create(<Button title="Test Button" onPress={onPress} />);
      const button = renderer.root.findByProps({
        accessibilityRole: "button",
        accessibilityLabel: "Test Button",
      });

      expect(button).toBeDefined();
      expect(JSON.stringify(renderer.toJSON())).toContain("Test Button");

      act(() => {
        button.props.onPress();
      });

      expect(onPress).toHaveBeenCalledTimes(1);
    });

    it("shows loading state", () => {
      const renderer = TestRenderer.create(<Button title="Loading" onPress={() => {}} loading />);
      const button = renderer.root.findByProps({
        accessibilityRole: "button",
        accessibilityLabel: "Loading",
      });

      expect(button.props.accessibilityState?.busy).toBe(true);
    });
  });

  describe("Card", () => {
    it("renders children correctly", () => {
      const renderer = TestRenderer.create(
        <Card>
          <Text>Card Content</Text>
        </Card>,
      );

      expect(JSON.stringify(renderer.toJSON())).toContain("Card Content");
    });
  });
});

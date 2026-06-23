import { render, fireEvent } from "@testing-library/react-native";
import { Button } from "../src/components/Button";
import { Card } from "../src/components/Card";
import React from "react";
import { describe, it, expect, vi } from "vitest";
import { Text } from "react-native";

describe("Core Components", () => {
  describe("Button", () => {
    it("renders correctly and handles press", () => {
      const onPress = vi.fn();
      const { getByText } = render(<Button title="Test Button" onPress={onPress} />);

      const button = getByText("Test Button");
      expect(button).toBeDefined();

      fireEvent.press(button);
      expect(onPress).toHaveBeenCalled();
    });

    it("shows loading state", () => {
      const { getByTestId } = render(<Button title="Loading" onPress={() => {}} loading />);
      // ActivityIndicator is rendered
    });
  });

  describe("Card", () => {
    it("renders children correctly", () => {
      const { getByText } = render(
        <Card>
          <Text>Card Content</Text>
        </Card>,
      );
      expect(getByText("Card Content")).toBeDefined();
    });
  });
});

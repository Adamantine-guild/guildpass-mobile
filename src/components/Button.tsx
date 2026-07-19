import { Text, TouchableOpacity, ActivityIndicator } from "react-native";
import React from "react";

type ButtonProps = {
  title: string;
  onPress: () => void;
  variant?: "primary" | "secondary" | "outline" | "danger";
  loading?: boolean;
  disabled?: boolean;
  className?: string;
  testID?: string;
  accessibilityLabel?: string;
};

export const Button = ({
  title,
  onPress,
  variant = "primary",
  loading = false,
  disabled = false,
  className = "",
  testID,
  accessibilityLabel,
}: ButtonProps) => {
  const getVariantStyles = () => {
    switch (variant) {
      case "primary":
        return "bg-primary";
      case "secondary":
        return "bg-secondary";
      case "outline":
        return "bg-transparent border border-primary";
      case "danger":
        return "bg-error";
      default:
        return "bg-primary";
    }
  };

  const getTextStyles = () => {
    switch (variant) {
      case "outline":
        return "text-primary";
      default:
        return "text-white";
    }
  };

  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled || loading}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? title}
      accessibilityState={{ disabled: disabled || loading, busy: loading }}
      testID={testID}
      className={`py-4 px-6 rounded-xl flex-row justify-center items-center ${getVariantStyles()} ${
        disabled || loading ? "opacity-50" : ""
      } ${className}`}
    >
      {loading ? (
        <ActivityIndicator color={variant === "outline" ? "#6366f1" : "white"} />
      ) : (
        <Text className={`font-semibold text-lg ${getTextStyles()}`}>{title}</Text>
      )}
    </TouchableOpacity>
  );
};

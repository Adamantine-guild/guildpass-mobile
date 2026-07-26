import { View, Text, TextInput } from "react-native";
import React from "react";
import { Card } from "./Card";

type WalletInputProps = {
  value: string;
  onChangeText: (text: string) => void;
  onBlur?: () => void;
  placeholder?: string;
  error?: string | null;
  testID?: string;
};

export const WalletInput = ({
  value,
  onChangeText,
  onBlur,
  placeholder = "0x...",
  error = null,
  testID,
}: WalletInputProps) => {
  return (
    <View className="w-full">
      <Text className="text-text-muted mb-2 font-medium">Wallet Address</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        onBlur={onBlur}
        placeholder={placeholder}
        accessibilityLabel="Wallet Address"
        accessibilityHint="Enter your wallet address starting with 0x"
        testID={testID}
        className={`bg-white border ${
          error ? "border-error" : "border-border"
        } rounded-xl p-4 text-text text-lg`}
        autoCapitalize="none"
        autoCorrect={false}
      />
      {error && (
        <Text className="text-error mt-2 text-sm" accessibilityRole="alert">
          {error}
        </Text>
      )}
    </View>
  );
};

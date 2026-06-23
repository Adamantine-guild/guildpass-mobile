import { View, Text, TextInput } from "react-native";
import React from "react";
import { Card } from "./Card";

type WalletInputProps = {
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  error?: string | null;
};

export const WalletInput = ({
  value,
  onChangeText,
  placeholder = "0x...",
  error = null,
}: WalletInputProps) => {
  return (
    <View className="w-full">
      <Text className="text-text-muted mb-2 font-medium">Wallet Address</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        className={`bg-white border ${
          error ? "border-error" : "border-border"
        } rounded-xl p-4 text-text text-lg`}
        autoCapitalize="none"
        autoCorrect={false}
      />
      {error && <Text className="text-error mt-2 text-sm">{error}</Text>}
    </View>
  );
};

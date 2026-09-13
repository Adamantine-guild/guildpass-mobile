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
      <Text
        className="text-text-muted dark:text-slate-400 mb-2 font-medium"
        nativeID={testID ? `${testID}-label` : undefined}
      >
        Wallet Address
      </Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        onBlur={onBlur}
        placeholder={placeholder}
        accessibilityLabel="Wallet Address"
        accessibilityHint="Enter your Ethereum wallet address starting with 0x"
        accessibilityState={{ disabled: false }}
        testID={testID}
        className={`bg-white dark:bg-slate-800 border ${
          error ? "border-error" : "border-border dark:border-slate-700"
        } rounded-xl p-4 text-text dark:text-slate-100 text-lg`}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="default"
        returnKeyType="done"
        clearButtonMode="while-editing"
      />
      {error && (
        <Text
          className="text-error mt-2 text-sm"
          accessibilityRole="alert"
          accessibilityLiveRegion="assertive"
          testID={testID ? `${testID}-error` : undefined}
        >
          {error}
        </Text>
      )}
    </View>
  );
};

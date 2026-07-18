import { View, Text, TextInput, KeyboardTypeOptions } from "react-native";
import React from "react";

type LabeledInputProps = {
  label: string;
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  error?: string | null;
  accessibilityHint?: string;
  keyboardType?: KeyboardTypeOptions;
  testID?: string;
  errorTestID?: string;
};

/**
 * Shared labelled text field with the app's standard input chrome and
 * error treatment. WalletInput and the social onboarding email field both
 * render through this so the styling and alert semantics stay in one place.
 */
export const LabeledInput = ({
  label,
  value,
  onChangeText,
  placeholder,
  error = null,
  accessibilityHint,
  keyboardType,
  testID,
  errorTestID,
}: LabeledInputProps) => {
  return (
    <View className="w-full">
      <Text className="text-text-muted mb-2 font-medium">{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        accessibilityLabel={label}
        accessibilityHint={accessibilityHint}
        testID={testID}
        className={`bg-white border ${
          error ? "border-error" : "border-border"
        } rounded-xl p-4 text-text text-lg`}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType={keyboardType}
      />
      {error && (
        <Text className="text-error mt-2 text-sm" accessibilityRole="alert" testID={errorTestID}>
          {error}
        </Text>
      )}
    </View>
  );
};

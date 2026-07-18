import React from "react";
import { LabeledInput } from "./LabeledInput";

type WalletInputProps = {
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  error?: string | null;
  testID?: string;
};

export const WalletInput = ({
  value,
  onChangeText,
  placeholder = "0x...",
  error = null,
  testID,
}: WalletInputProps) => {
  return (
    <LabeledInput
      label="Wallet Address"
      value={value}
      onChangeText={onChangeText}
      placeholder={placeholder}
      error={error}
      accessibilityHint="Enter your wallet address starting with 0x"
      testID={testID}
    />
  );
};

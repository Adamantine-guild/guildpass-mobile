import { View, Text, TouchableOpacity } from "react-native";
import React, { useEffect, useRef, useState } from "react";
import * as Clipboard from "expo-clipboard";

const COPIED_FEEDBACK_DURATION_MS = 2000;

export const truncateAddress = (address: string): string => {
  if (address.length <= 12) {
    return address;
  }
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
};

type AddressChipProps = {
  address: string;
  className?: string;
  testID?: string;
};

export const AddressChip = ({ address, className = "", testID }: AddressChipProps) => {
  const [copied, setCopied] = useState(false);
  const resetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (resetTimer.current) {
        clearTimeout(resetTimer.current);
      }
    };
  }, []);

  const handleCopy = async () => {
    await Clipboard.setStringAsync(address);
    setCopied(true);
    if (resetTimer.current) {
      clearTimeout(resetTimer.current);
    }
    resetTimer.current = setTimeout(() => setCopied(false), COPIED_FEEDBACK_DURATION_MS);
  };

  return (
    <TouchableOpacity
      onPress={handleCopy}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityLabel={copied ? "Address copied to clipboard" : `Copy wallet address ${address}`}
      testID={testID}
      className={`flex-row items-center bg-primary/10 px-3 py-1.5 rounded-lg ${className}`}
    >
      <Text className="text-text font-medium text-sm mr-2" numberOfLines={1}>
        {truncateAddress(address)}
      </Text>
      <View testID={testID ? `${testID}-feedback` : undefined}>
        <Text className="text-primary text-xs font-medium">{copied ? "Copied!" : "Copy"}</Text>
      </View>
    </TouchableOpacity>
  );
};

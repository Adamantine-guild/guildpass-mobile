import { View } from "react-native";
import React from "react";

type CardProps = {
  children: React.ReactNode;
  className?: string;
};

export const Card = ({ children, className = "" }: CardProps) => {
  return (
    <View className={`bg-white rounded-2xl p-4 shadow-sm border border-border ${className}`}>
      {children}
    </View>
  );
};

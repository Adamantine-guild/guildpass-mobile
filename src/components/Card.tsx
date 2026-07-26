import { View } from "react-native";
import type { ViewProps } from "react-native";
import React from "react";

type CardProps = ViewProps & {
  children: React.ReactNode;
  className?: string;
};

export const Card = ({ children, className = "", ...props }: CardProps) => {
  return (
    <View
      {...props}
      className={`bg-white rounded-2xl p-4 shadow-sm border border-border ${className}`}
    >
      {children}
    </View>
  );
};

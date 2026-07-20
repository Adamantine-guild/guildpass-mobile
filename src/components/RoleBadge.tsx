import { View, Text } from "react-native";
import React from "react";

export type RoleBadgeTier = "default" | "premium" | "restricted";

const TIER_STYLES: Record<RoleBadgeTier, { container: string; text: string; icon: string }> = {
  default: { container: "bg-primary/10", text: "text-primary", icon: "●" },
  premium: { container: "bg-success/10", text: "text-success", icon: "★" },
  restricted: { container: "bg-error/10", text: "text-error", icon: "▲" },
};

type RoleBadgeProps = {
  name: string;
  tier?: RoleBadgeTier;
};

export const RoleBadge = ({ name, tier = "default" }: RoleBadgeProps) => {
  const styles = TIER_STYLES[tier];

  return (
    <View
      className={`flex-row items-center ${styles.container} px-3 py-1.5 rounded-lg mr-2 mb-2`}
      accessibilityLabel={`Role: ${name}`}
    >
      <Text
        className={`${styles.text} text-xs mr-1`}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        {styles.icon}
      </Text>
      <Text className={`${styles.text} font-medium text-sm`}>{name}</Text>
    </View>
  );
};

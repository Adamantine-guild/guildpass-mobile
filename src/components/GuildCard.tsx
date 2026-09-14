import { View, Text, TouchableOpacity } from "react-native";
import React, { memo } from "react";
import { Card } from "./Card";
import { RoleBadge } from "./RoleBadge";
import type { GuildPassStatus } from "../features/passes/passCache";

type GuildCardProps = {
  name: string;
  id: string;
  isActive: boolean;
  roleCount: number;
  status?: GuildPassStatus;
  offlineCached?: boolean;
  onPress: (id: string) => void;
};

const STATUS_STYLES: Record<
  GuildPassStatus,
  { label: string; pill: string; text: string; roleTier: "default" | "premium" | "restricted" }
> = {
  active: {
    label: "ACTIVE",
    pill: "bg-success/10",
    text: "text-success",
    roleTier: "premium",
  },
  inactive: {
    label: "INACTIVE",
    pill: "bg-text-muted/10",
    text: "text-text-muted",
    roleTier: "default",
  },
  expired: {
    label: "EXPIRED",
    pill: "bg-secondary/10",
    text: "text-secondary",
    roleTier: "default",
  },
  revoked: {
    label: "REVOKED",
    pill: "bg-error/10",
    text: "text-error",
    roleTier: "restricted",
  },
  unknown: {
    label: "UNKNOWN",
    pill: "bg-text-muted/10",
    text: "text-text-muted",
    roleTier: "default",
  },
};

const GuildCard = memo(({
  name,
  id,
  isActive,
  roleCount,
  status,
  offlineCached = false,
  onPress,
}: GuildCardProps) => {
  const resolvedStatus = status ?? (isActive ? "active" : "inactive");
  const statusStyle = STATUS_STYLES[resolvedStatus];

  const a11yLabel = [
    name,
    `${statusStyle.label.toLowerCase()} guild`,
    `${roleCount} ${roleCount === 1 ? "role" : "roles"}`,
    offlineCached ? "cached offline" : null,
  ]
    .filter(Boolean)
    .join(", ");

  return (
    <TouchableOpacity
      onPress={() => onPress(id)}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityLabel={a11yLabel}
      accessibilityHint="Tap to view guild details"
    >
      <Card className="mb-4">
        <View className="flex-row justify-between items-center mb-2">
          <Text
            className="text-xl font-bold text-text dark:text-slate-100"
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
          >
            {name}
          </Text>
          <View
            className={`px-3 py-1 rounded-full ${statusStyle.pill}`}
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
          >
            <Text className={`text-xs font-bold ${statusStyle.text}`}>{statusStyle.label}</Text>
          </View>
        </View>
        <Text
          className="text-text-muted dark:text-slate-400 text-sm mb-4"
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        >
          ID: {id}
        </Text>
        <View
          className="flex-row items-center flex-wrap"
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        >
          <RoleBadge
            name={`${roleCount} ${roleCount === 1 ? "Role" : "Roles"}`}
            tier={statusStyle.roleTier}
          />
          <Text className="text-text-muted dark:text-slate-400 mx-2">•</Text>
          <Text className="text-text-muted dark:text-slate-400">Tap to view details</Text>
          {offlineCached ? (
            <>
              <Text className="text-text-muted dark:text-slate-400 mx-2">•</Text>
              <Text className="text-secondary font-semibold" testID="guild-card-offline-cache">
                Cached offline
              </Text>
            </>
          ) : null}
        </View>
      </Card>
    </TouchableOpacity>
  );
});

export { GuildCard };
export default GuildCard;

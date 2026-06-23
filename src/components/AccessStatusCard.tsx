import { View, Text } from "react-native";
import React from "react";
import { Card } from "./Card";
import { RoleBadge } from "./RoleBadge";

type AccessStatusCardProps = {
  hasAccess: boolean;
  reason?: string;
  matchedRoles: string[];
  requiredRoles: string[];
};

export const AccessStatusCard = ({
  hasAccess,
  reason,
  matchedRoles,
  requiredRoles,
}: AccessStatusCardProps) => {
  return (
    <Card className={`border-2 ${hasAccess ? "border-success" : "border-error"}`}>
      <View className="items-center mb-6">
        <View
          className={`w-16 h-16 rounded-full items-center justify-center mb-4 ${
            hasAccess ? "bg-success" : "bg-error"
          }`}
        >
          <Text className="text-white text-3xl">{hasAccess ? "✓" : "✕"}</Text>
        </View>
        <Text className={`text-2xl font-bold ${hasAccess ? "text-success" : "text-error"}`}>
          {hasAccess ? "Access Granted" : "Access Denied"}
        </Text>
        {reason && <Text className="text-text-muted mt-2 text-center">{reason}</Text>}
      </View>

      <View className="border-t border-border pt-4">
        <Text className="text-text font-bold mb-3">Requirements</Text>
        <View className="flex-row flex-wrap">
          {requiredRoles.length > 0 ? (
            requiredRoles.map((role) => <RoleBadge key={role} name={role} />)
          ) : (
            <Text className="text-text-muted italic">No role requirements specified</Text>
          )}
        </View>

        {hasAccess && matchedRoles.length > 0 && (
          <View className="mt-4">
            <Text className="text-success font-bold mb-3">Matched Roles</Text>
            <View className="flex-row flex-wrap">
              {matchedRoles.map((role) => (
                <RoleBadge key={role} name={role} />
              ))}
            </View>
          </View>
        )}
      </View>
    </Card>
  );
};

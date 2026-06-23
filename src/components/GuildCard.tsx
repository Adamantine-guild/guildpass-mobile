import { View, Text, TouchableOpacity } from "react-native";
import React from "react";
import { Card } from "./Card";

type GuildCardProps = {
  name: string;
  id: string;
  isActive: boolean;
  roleCount: number;
  onPress: () => void;
};

export const GuildCard = ({ name, id, isActive, roleCount, onPress }: GuildCardProps) => {
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.7}>
      <Card className="mb-4">
        <View className="flex-row justify-between items-center mb-2">
          <Text className="text-xl font-bold text-text">{name}</Text>
          <View
            className={`px-3 py-1 rounded-full ${
              isActive ? "bg-success/10" : "bg-text-muted/10"
            }`}
          >
            <Text className={`text-xs font-bold ${isActive ? "text-success" : "text-text-muted"}`}>
              {isActive ? "ACTIVE" : "INACTIVE"}
            </Text>
          </View>
        </View>
        <Text className="text-text-muted text-sm mb-4">ID: {id}</Text>
        <View className="flex-row items-center">
          <Text className="text-primary font-semibold">{roleCount} Roles</Text>
          <Text className="text-text-muted mx-2">•</Text>
          <Text className="text-text-muted">Tap to view details</Text>
        </View>
      </Card>
    </TouchableOpacity>
  );
};

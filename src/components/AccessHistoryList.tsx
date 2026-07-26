import { View, Text, ScrollView } from "react-native";
import React, { useState } from "react";
import { Card } from "./Card";
import { Button } from "./Button";
import type { AccessHistoryEntry } from "../features/access/accessHistory.store";
import { useResolvedGuildName } from "../features/guilds/useGuildName";

type AccessHistoryListProps = {
  entries: AccessHistoryEntry[];
  onClear: () => void;
};

const statusLabel = (status: AccessHistoryEntry["status"]) => {
  switch (status) {
    case "granted":
      return "Granted";
    case "denied":
      return "Denied";
    case "error":
      return "Error";
  }
};

const statusClassName = (status: AccessHistoryEntry["status"]) => {
  switch (status) {
    case "granted":
      return "text-success";
    case "error":
      return "text-error";
    default:
      return "text-error";
  }
};

const HistoryRow = ({ entry }: { entry: AccessHistoryEntry }) => {
  const guildName = useResolvedGuildName(entry.guildId);

  return (
    <View className="py-3 border-t border-border">
      <View className="flex-row justify-between">
        <Text className="text-text font-semibold">{entry.resourceName}</Text>
        <Text className={`font-bold ${statusClassName(entry.status)}`}>
          {statusLabel(entry.status)}
        </Text>
      </View>
      <Text className="text-text-muted text-sm mt-1">{guildName}</Text>
      {entry.reason ? <Text className="text-text-muted text-sm mt-1">{entry.reason}</Text> : null}
      <Text className="text-text-muted text-xs mt-1">
        {new Date(entry.checkedAt).toLocaleString()}
      </Text>
    </View>
  );
};

export const AccessHistoryList = ({ entries, onClear }: AccessHistoryListProps) => {
  const [expanded, setExpanded] = useState(false);

  return (
    <Card className="mb-4">
      <View className="mb-4">
        <Text className="text-lg font-bold text-text mb-3">
          Recent Access Checks ({entries.length})
        </Text>
        <View className="flex-row justify-end gap-2">
          {entries.length > 0 ? (
            <Button
              title="Clear"
              accessibilityLabel="Clear History"
              onPress={onClear}
              variant="outline"
              className="py-2 px-3"
            />
          ) : null}
          <Button
            title={expanded ? "Hide" : "Show"}
            accessibilityLabel={expanded ? "Collapse access history" : "Expand access history"}
            onPress={() => setExpanded((value) => !value)}
            variant="outline"
            className="py-2 px-3"
          />
        </View>
      </View>

      {expanded && (
        <View>
          {entries.length === 0 ? (
            <Text className="text-text-muted">No recent access checks.</Text>
          ) : (
            <ScrollView
              className="max-h-72"
              nestedScrollEnabled
              contentContainerStyle={{ paddingBottom: 4 }}
            >
              {entries.map((entry) => (
                <HistoryRow key={entry.id} entry={entry} />
              ))}
            </ScrollView>
          )}
        </View>
      )}
    </Card>
  );
};

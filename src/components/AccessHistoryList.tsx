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
  const dateString = new Date(entry.checkedAt).toLocaleString();
  const statusText = statusLabel(entry.status);

  const a11yLabel = [
    `${entry.resourceName}: ${statusText}`,
    `Guild: ${guildName}`,
    entry.reason ? `Reason: ${entry.reason}` : null,
    `Checked ${dateString}`,
  ]
    .filter(Boolean)
    .join(". ");

  return (
    <View
      className="py-3 border-t border-border dark:border-slate-700"
      accessible
      accessibilityLabel={a11yLabel}
    >
      <View className="flex-row justify-between" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <Text className="text-text dark:text-slate-100 font-semibold">{entry.resourceName}</Text>
        <Text className={`font-bold ${statusClassName(entry.status)}`}>
          {statusText}
        </Text>
      </View>
      <Text className="text-text-muted dark:text-slate-400 text-sm mt-1" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">{guildName}</Text>
      {entry.reason ? <Text className="text-text-muted dark:text-slate-400 text-sm mt-1" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">{entry.reason}</Text> : null}
      <Text className="text-text-muted dark:text-slate-400 text-xs mt-1" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        {dateString}
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

/**
 * Push Notification Rationale Screen Component
 *
 * A clear explanation screen shown before requesting push notification permissions.
 * Follows iOS/Android best practices by explaining the value proposition first.
 */

import React from "react";
import { View, Text, ScrollView } from "react-native";
import { Button } from "../../components/Button";

interface PushNotificationRationaleProps {
  onAccept: () => void;
  onDecline: () => void;
  isLoading?: boolean;
}

export function PushNotificationRationale({
  onAccept,
  onDecline,
  isLoading = false,
}: PushNotificationRationaleProps) {
  return (
    <View className="flex-1 bg-background dark:bg-slate-900">
      <ScrollView className="flex-1 px-6 py-8">
        <View className="items-center mb-6">
          <View className="w-16 h-16 rounded-full bg-primary dark:bg-indigo-600 items-center justify-center mb-4">
            <Text className="text-3xl">🔔</Text>
          </View>
          <Text className="text-2xl font-bold text-text dark:text-slate-100 text-center">
            Stay Updated
          </Text>
        </View>

        <Text className="text-base text-text dark:text-slate-100 mb-6 leading-relaxed">
          Enable push notifications to receive real-time updates about your guild memberships and
          access grants.
        </Text>

        <View className="mb-8">
          <View className="flex-row mb-4">
            <View className="w-10 h-10 rounded-full bg-success/20 dark:bg-green-900/30 items-center justify-center mr-3">
              <Text className="text-xl">✨</Text>
            </View>
            <View className="flex-1">
              <Text className="text-base font-semibold text-text dark:text-slate-100 mb-1">
                Role Updates
              </Text>
              <Text className="text-sm text-text-muted dark:text-slate-400">
                Get notified immediately when you're assigned a new role or your roles change in
                any guild.
              </Text>
            </View>
          </View>

          <View className="flex-row mb-4">
            <View className="w-10 h-10 rounded-full bg-primary/20 dark:bg-indigo-900/30 items-center justify-center mr-3">
              <Text className="text-xl">🎟️</Text>
            </View>
            <View className="flex-1">
              <Text className="text-base font-semibold text-text dark:text-slate-100 mb-1">
                Access Grants
              </Text>
              <Text className="text-sm text-text-muted dark:text-slate-400">
                Learn when you gain access to new resources, including time-sensitive event access.
              </Text>
            </View>
          </View>

          <View className="flex-row">
            <View className="w-10 h-10 rounded-full bg-warning/20 dark:bg-amber-900/30 items-center justify-center mr-3">
              <Text className="text-xl">⚡</Text>
            </View>
            <View className="flex-1">
              <Text className="text-base font-semibold text-text dark:text-slate-100 mb-1">
                Quick Access
              </Text>
              <Text className="text-sm text-text-muted dark:text-slate-400">
                Tap any notification to jump directly to the relevant guild or resource screen.
              </Text>
            </View>
          </View>
        </View>

        <View className="bg-border/30 dark:bg-slate-800/50 rounded-lg p-4 mb-6">
          <Text className="text-xs text-text-muted dark:text-slate-400 leading-relaxed">
            <Text className="font-semibold">Privacy Note:</Text> Your push token is stored securely
            and only used to deliver notifications about your own guild activity. You can disable
            notifications anytime in Settings.
          </Text>
        </View>

        <Button
          title="Enable Notifications"
          onPress={onAccept}
          loading={isLoading}
          disabled={isLoading}
          className="mb-3"
          testID="enable-notifications-button"
        />

        <Button
          title="Not Now"
          onPress={onDecline}
          variant="secondary"
          disabled={isLoading}
          testID="decline-notifications-button"
        />
      </ScrollView>
    </View>
  );
}

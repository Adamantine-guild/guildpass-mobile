import { View, Text } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import React from "react";
import { AppHeader } from "../src/components/AppHeader";
import { Button } from "../src/components/Button";
import { Card } from "../src/components/Card";

export default function DeepLinkError() {
  const router = useRouter();
  const { message } = useLocalSearchParams<{ message?: string | string[] }>();
  const messageText = Array.isArray(message) ? message[0] : message;
  const detailMessage =
    messageText ||
    "The link you followed is not supported or is malformed. Please check the URL and try again.";

  return (
    <View className="flex-1 bg-background dark:bg-slate-900" testID="deep-link-error-screen">
      <AppHeader title="Link Error" showBack={false} />
      <View className="flex-1 px-4 py-6 justify-center">
        <Card className="items-center py-8">
          <Text className="text-4xl mb-4">🔗</Text>
          <Text
            className="text-2xl font-bold text-text dark:text-slate-100 mb-3 text-center"
            testID="deep-link-error-title"
          >
            Invalid Link
          </Text>
          <Text
            className="text-text-muted dark:text-slate-400 text-center mb-6 px-4"
            testID="deep-link-error-message"
          >
            {detailMessage}
          </Text>
          <Button title="Go to Home" onPress={() => router.replace("/")} className="w-full" />
        </Card>
      </View>
    </View>
  );
}

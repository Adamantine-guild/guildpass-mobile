import { View, Text, SafeAreaView } from "react-native";
import { useRouter } from "expo-router";
import { Button } from "../src/components/Button";

export default function Onboarding() {
  const router = useRouter();

  return (
    <SafeAreaView className="flex-1 bg-white" testID="onboarding-screen">
      <View className="flex-1 px-6 justify-between py-12">
        <View className="items-center mt-12">
          <View className="w-24 h-24 bg-primary rounded-3xl items-center justify-center mb-8 shadow-lg">
            <Text className="text-white text-4xl font-bold">GP</Text>
          </View>
          <Text className="text-3xl font-bold text-text text-center mb-4" testID="onboarding-title">
            Welcome to GuildPass
          </Text>
          <Text className="text-lg text-text-muted text-center px-4" testID="onboarding-subtitle">
            The decentralized gateway to your favorite Web3 communities and gated content.
          </Text>
        </View>

        <View className="space-y-4">
          <View className="bg-background p-4 rounded-2xl mb-8">
            <Text className="text-text font-semibold mb-2 text-center">MVP Preview Mode</Text>
            <Text className="text-text-muted text-sm text-center">
              you can manually enter any wallet address to explore guild memberships.
            </Text>
          </View>

          <Button
            title="I have a wallet"
            onPress={() => router.push("/profile")}
            testID="onboarding-get-started-button"
          />
          <Button
            title="Get started without one"
            variant="outline"
            onPress={() => router.push("/social-onboarding")}
            className="mt-4"
            testID="onboarding-social-login-button"
          />
          <Text className="text-text-muted text-xs text-center mt-3">
            No wallet? Sign in with your email and we set one up for you.
          </Text>
        </View>
      </View>
    </SafeAreaView>
  );
}

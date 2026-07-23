import { View, Text, SafeAreaView } from "react-native";
import { useState } from "react";
import { useRouter } from "expo-router";
import { Button } from "../src/components/Button";
import { EmbeddedWalletOnboarding } from "../src/features/wallet/EmbeddedWalletOnboarding";
import { isEmbeddedWalletEnabled } from "../src/features/wallet/EmbeddedWalletProvider";

export default function Onboarding() {
  const router = useRouter();
  const [showEmbeddedWallet, setShowEmbeddedWallet] = useState(false);

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
          <Text className="text-sm text-text-muted text-center px-4 mt-4" testID="onboarding-attestation-warning">
            Offline role attestations are stored only on this device. If the app or device is lost, reset, or replaced, those local proofs cannot currently be restored and must be reissued by the guild when connectivity is available.
          </Text>
        </View>

        <View className="space-y-4">
          {showEmbeddedWallet && isEmbeddedWalletEnabled ? (
            <EmbeddedWalletOnboarding
              onComplete={() => router.replace("/profile")}
              onBack={() => setShowEmbeddedWallet(false)}
            />
          ) : (
            <>
              <Text className="text-text font-semibold text-center">How would you like to continue?</Text>
              {isEmbeddedWalletEnabled ? (
                <Button
                  title="Get started without a wallet"
                  onPress={() => setShowEmbeddedWallet(true)}
                  testID="onboarding-embedded-wallet-button"
                />
              ) : null}
              <Button
                title="I have a wallet"
                variant={isEmbeddedWalletEnabled ? "outline" : "primary"}
                onPress={() => router.push("/profile")}
                testID="onboarding-get-started-button"
              />
              {!isEmbeddedWalletEnabled ? (
                <Text className="text-text-muted text-sm text-center">
                  You can connect an existing wallet or enter an address manually.
                </Text>
              ) : null}
            </>
          )}
        </View>
      </View>
    </SafeAreaView>
  );
}

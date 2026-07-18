import { View, Text, ScrollView } from "react-native";
import React, { useState } from "react";
import { useRouter } from "expo-router";
import { AppHeader } from "../src/components/AppHeader";
import { Card } from "../src/components/Card";
import { Button } from "../src/components/Button";
import { LabeledInput } from "../src/components/LabeledInput";
import { useWallet } from "../src/features/wallet/useWallet";

/**
 * Social login / embedded wallet onboarding (Issue #104).
 *
 * The "Get started without one" branch: authenticates via a social/email
 * method and provisions an embedded wallet behind the scenes. The resulting
 * address lands in the same wallet store as manual/WalletConnect paths, so
 * every downstream flow (guilds, membership, access checks, route guards)
 * works without special-casing.
 */
export default function SocialOnboarding() {
  const router = useRouter();
  const { connectWithSocial } = useWallet();
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);

  const handleContinue = async () => {
    setIsConnecting(true);
    setError(null);
    const result = await connectWithSocial("email", { email });
    setIsConnecting(false);
    if (!result.success) {
      setError(result.error ?? "Could not set up your wallet. Please try again.");
      return;
    }
    router.replace("/profile");
  };

  return (
    <View className="flex-1 bg-background" testID="social-onboarding-screen">
      <AppHeader title="Get Started" />
      <ScrollView className="flex-1 px-4 py-6">
        <Text className="text-2xl font-bold text-text mb-2">No wallet? No problem.</Text>
        <Text className="text-text-muted mb-8">
          Sign in with your email and GuildPass sets up a wallet for you automatically —
          you can explore guilds and check access right away.
        </Text>

        <Card className="mb-6">
          <LabeledInput
            label="Email"
            value={email}
            onChangeText={(text) => {
              setEmail(text);
              setError(null);
            }}
            placeholder="you@example.com"
            error={error}
            accessibilityHint="Enter your email address to create an embedded wallet"
            keyboardType="email-address"
            testID="social-email-input"
            errorTestID="social-onboarding-error"
          />
          <Button
            title="Continue with Email"
            onPress={() => void handleContinue()}
            loading={isConnecting}
            className="mt-6"
            testID="social-continue-button"
          />
        </Card>

        <View className="bg-background border border-border p-4 rounded-2xl mb-6">
          <Text className="text-text font-semibold mb-2">How your wallet is managed</Text>
          <Text className="text-text-muted text-sm">
            In this preview build, your email is converted into a preview wallet address —
            nothing is stored, no private keys are created, and the wallet cannot sign
            transactions. Production builds will provision a self-custodial embedded wallet
            through an MPC provider. See SECURITY.md for the full custody model.
          </Text>
        </View>

        <Button
          title="I have a wallet instead"
          variant="outline"
          onPress={() => router.replace("/profile")}
          testID="social-use-own-wallet-button"
        />
      </ScrollView>
    </View>
  );
}

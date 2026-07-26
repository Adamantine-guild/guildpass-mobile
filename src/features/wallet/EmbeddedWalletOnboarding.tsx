import React, { useEffect, useRef, useState } from "react";
import { Text, TextInput, View } from "react-native";
import {
  useEmbeddedEthereumWallet,
  useLoginWithEmail,
  useLoginWithOAuth,
  usePrivy,
} from "@privy-io/expo";
import { Button } from "../../components/Button";
import { useWallet } from "./useWallet";

type Props = { onComplete(): void; onBack(): void };

/** Provider-specific sign-in whose only application output is an EVM address. */
export function EmbeddedWalletOnboarding({ onComplete, onBack }: Props) {
  const { isReady, authenticated } = usePrivy();
  const { sendCode, loginWithCode } = useLoginWithEmail();
  const { login } = useLoginWithOAuth();
  const { wallets } = useEmbeddedEthereumWallet();
  const { connectEmbeddedWallet } = useWallet();
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [codeSent, setCodeSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const hasConnectedWallet = useRef(false);

  useEffect(() => {
    const address = wallets[0]?.address;
    if (!authenticated || !address || hasConnectedWallet.current) return;
    hasConnectedWallet.current = true;
    void connectEmbeddedWallet(address).then((result) => {
      if (result.success) onComplete();
      else {
        hasConnectedWallet.current = false;
        setError(result.error ?? "Your wallet could not be connected.");
      }
    });
  }, [authenticated, wallets, connectEmbeddedWallet, onComplete]);

  const sendEmailCode = async () => {
    setBusy(true);
    setError(null);
    try {
      await sendCode({ email: email.trim() });
      setCodeSent(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not send a verification code.");
    } finally {
      setBusy(false);
    }
  };
  const verifyEmailCode = async () => {
    setBusy(true);
    setError(null);
    try {
      await loginWithCode({ email: email.trim(), code: code.trim() });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "That verification code was not accepted.");
    } finally {
      setBusy(false);
    }
  };
  const loginWithGoogle = async () => {
    setBusy(true);
    setError(null);
    try {
      await login({ provider: "google" });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Google sign-in was cancelled or failed.");
    } finally {
      setBusy(false);
    }
  };

  if (!isReady)
    return <Text className="text-text-muted text-center">Preparing secure sign-in…</Text>;
  return (
    <View testID="embedded-wallet-onboarding" className="space-y-4">
      <Text className="text-xl font-bold text-text text-center">Create your wallet</Text>
      <Text className="text-text-muted text-center">
        Sign in with email or Google. A secure wallet will be created for you automatically.
      </Text>
      <Button
        title="Continue with Google"
        onPress={loginWithGoogle}
        loading={busy}
        testID="social-google-button"
      />
      <View className="flex-row items-center">
        <View className="flex-1 h-px bg-border" />
        <Text className="mx-3 text-text-muted">or email</Text>
        <View className="flex-1 h-px bg-border" />
      </View>
      <TextInput
        value={email}
        onChangeText={setEmail}
        editable={!busy && !codeSent}
        autoCapitalize="none"
        autoComplete="email"
        inputMode="email"
        keyboardType="email-address"
        placeholder="you@example.com"
        className="border border-border rounded-xl p-4 text-text bg-white"
        testID="embedded-wallet-email-input"
      />
      {codeSent ? (
        <TextInput
          value={code}
          onChangeText={setCode}
          editable={!busy}
          autoComplete="one-time-code"
          inputMode="numeric"
          keyboardType="number-pad"
          placeholder="Verification code"
          className="border border-border rounded-xl p-4 text-text bg-white"
          testID="embedded-wallet-code-input"
        />
      ) : null}
      <Button
        title={codeSent ? "Verify and create wallet" : "Email me a code"}
        onPress={codeSent ? verifyEmailCode : sendEmailCode}
        loading={busy}
        testID="embedded-wallet-email-button"
      />
      {error ? <Text className="text-red-600 text-center">{error}</Text> : null}
      <Button
        title="I have a wallet"
        variant="outline"
        onPress={onBack}
        testID="embedded-wallet-back-button"
      />
    </View>
  );
}

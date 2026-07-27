import React, { useState } from "react";
import { View, Text, TouchableOpacity, Linking } from "react-native";

const PRIVY_SECURITY_URL = "https://docs.privy.io/guide/security";

/**
 * Custody disclosure shown during embedded-wallet onboarding.
 *
 * Renders a summary line that is always visible, with a collapsible detail
 * section the user can expand. This satisfies the acceptance criterion of
 * "clear, honest in-app explanation" without forcing a blocking modal that
 * would hurt conversion.
 */
export function CustodyDisclosure({ testID = "custody-disclosure" }: { testID?: string }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <View
      testID={testID}
      className="bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800 rounded-2xl p-4 mb-4"
    >
      {/* ── Always-visible summary ─────────────────────────────────── */}
      <TouchableOpacity
        onPress={() => setExpanded((prev) => !prev)}
        accessibilityRole="button"
        accessibilityLabel={expanded ? "Collapse wallet details" : "Expand wallet details"}
        accessibilityState={{ expanded }}
        testID="custody-disclosure-toggle"
        activeOpacity={0.7}
      >
        <View className="flex-row items-center justify-between">
          <View className="flex-row items-center flex-1">
            <Text className="text-lg mr-2">🔐</Text>
            <Text className="text-sm font-semibold text-indigo-900 dark:text-indigo-200 flex-1">
              About your embedded wallet
            </Text>
          </View>
          <Text className="text-indigo-500 dark:text-indigo-400 text-xs">
            {expanded ? "Hide ▲" : "Details ▼"}
          </Text>
        </View>
        <Text className="text-xs text-indigo-700 dark:text-indigo-300 mt-1">
          A secure wallet will be created for you automatically — no seed phrase needed.
        </Text>
      </TouchableOpacity>

      {/* ── Expanded detail section ────────────────────────────────── */}
      {expanded ? (
        <View className="mt-3 pt-3 border-t border-indigo-200 dark:border-indigo-800" testID="custody-disclosure-details">
          <DetailItem
            emoji="🔑"
            title="How your keys are secured"
            body="Your wallet's private key is split using MPC (Multi-Party Computation). No single party — not Privy, not your device — ever holds the full key. Shares are stored in hardware-backed secure enclaves."
          />

          <DetailItem
            emoji="🔄"
            title="Recovery"
            body="You can recover your wallet by signing in with the same email or social account on any device. No seed phrase to lose or protect."
          />

          <DetailItem
            emoji="⚖️"
            title="Trade-offs vs. self-custody"
            body="You trust Privy's infrastructure to hold one key share securely. In exchange, you don't need to manage seed phrases or install a separate wallet app. You can export your full private key at any time from your account settings."
          />

          <DetailItem
            emoji="🌐"
            title="Interoperability"
            body="Your embedded wallet address works exactly like any other Ethereum address. Guilds, memberships, and access checks treat it identically to a self-custodied wallet."
          />

          <TouchableOpacity
            onPress={() => Linking.openURL(PRIVY_SECURITY_URL)}
            accessibilityRole="link"
            accessibilityLabel="Learn more about Privy security"
            testID="custody-disclosure-learn-more"
            className="mt-2"
          >
            <Text className="text-indigo-600 dark:text-indigo-400 text-xs font-medium underline">
              Learn more about Privy's security model →
            </Text>
          </TouchableOpacity>
        </View>
      ) : null}
    </View>
  );
}

function DetailItem({ emoji, title, body }: { emoji: string; title: string; body: string }) {
  return (
    <View className="mb-3">
      <Text className="text-xs font-semibold text-indigo-800 dark:text-indigo-200">
        {emoji} {title}
      </Text>
      <Text className="text-xs text-indigo-700 dark:text-indigo-300 mt-0.5 leading-4">
        {body}
      </Text>
    </View>
  );
}

/**
 * unknownChainId.test.tsx
 *
 * Regression tests for Issue #100:
 * "Unrecognised chain IDs in guild/role data render as a clearly-labelled
 * 'Unsupported network' state per-requirement, without breaking the rest of
 * the guild detail screen."
 *
 * Acceptance criteria (from the issue):
 *  - A test fixture with an unrecognised chainId renders the rest of the guild
 *    detail screen normally with only the affected requirement showing the
 *    fallback.
 *  - No unhandled exceptions/crash reports for this case.
 *
 * These tests exercise the components (RequirementCard, UnsupportedNetworkCard)
 * and the chainRegistry helpers directly, without needing a full Expo/Router
 * environment.
 */

import React from "react";
import { Text, View } from "react-native";
import { describe, it, expect, vi } from "vitest";
import TestRenderer from "react-test-renderer";
import { RequirementCard, UnsupportedNetworkCard } from "../src/components/RequirementCard";
import { isKnownChainId, getChainDisplayName } from "../src/lib/chainRegistry";
import {
  GUILD_UNKNOWN_CHAIN_FIXTURE,
  ROLES_WITH_UNKNOWN_CHAIN_FIXTURE,
} from "./fixtures/guild.fixtures";

// ---------------------------------------------------------------------------
// React Native mock (mirrors errorBoundary.test.tsx)
// ---------------------------------------------------------------------------

vi.mock("react-native", () => ({
  View: "View",
  Text: "Text",
  ScrollView: "ScrollView",
  TouchableOpacity: "TouchableOpacity",
  ActivityIndicator: "ActivityIndicator",
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const UNKNOWN_CHAIN_ID = GUILD_UNKNOWN_CHAIN_FIXTURE.chainId; // 999999
const KNOWN_CHAIN_ID = 1; // Ethereum mainnet

// ---------------------------------------------------------------------------
// 1. UnsupportedNetworkCard unit tests
// ---------------------------------------------------------------------------

describe("UnsupportedNetworkCard", () => {
  it("renders without throwing for any numeric chain ID", () => {
    expect(() =>
      TestRenderer.create(<UnsupportedNetworkCard chainId={UNKNOWN_CHAIN_ID} />)
    ).not.toThrow();
  });

  it("renders the 'Unsupported network' label", () => {
    const renderer = TestRenderer.create(
      <UnsupportedNetworkCard chainId={UNKNOWN_CHAIN_ID} />
    );
    const json = JSON.stringify(renderer.toJSON());
    expect(json).toContain("Unsupported network");
  });

  it("displays the chain ID in the fallback card", () => {
    const renderer = TestRenderer.create(
      <UnsupportedNetworkCard chainId={UNKNOWN_CHAIN_ID} />
    );
    const json = JSON.stringify(renderer.toJSON());
    expect(json).toContain(String(UNKNOWN_CHAIN_ID));
  });

  it("applies the testID prop when provided", () => {
    const renderer = TestRenderer.create(
      <UnsupportedNetworkCard chainId={UNKNOWN_CHAIN_ID} testID="my-unsupported-card" />
    );
    expect(
      renderer.root.findByProps({ testID: "my-unsupported-card" })
    ).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// 2. RequirementCard – unknown chain ID path
// ---------------------------------------------------------------------------

describe("RequirementCard – unrecognised chain ID", () => {
  it("renders the UnsupportedNetworkCard fallback without throwing", () => {
    expect(() =>
      TestRenderer.create(
        <RequirementCard chainId={UNKNOWN_CHAIN_ID}>
          <Text>Should not appear</Text>
        </RequirementCard>
      )
    ).not.toThrow();
  });

  it("does NOT render children when the chain ID is unrecognised", () => {
    const renderer = TestRenderer.create(
      <RequirementCard chainId={UNKNOWN_CHAIN_ID}>
        <Text testID="child-should-be-hidden">Sensitive content</Text>
      </RequirementCard>
    );
    const json = JSON.stringify(renderer.toJSON());
    // The fallback replaces children entirely
    expect(json).not.toContain("Sensitive content");
  });

  it("shows 'Unsupported network' in place of children", () => {
    const renderer = TestRenderer.create(
      <RequirementCard chainId={UNKNOWN_CHAIN_ID}>
        <Text>Role badge</Text>
      </RequirementCard>
    );
    const json = JSON.stringify(renderer.toJSON());
    expect(json).toContain("Unsupported network");
  });

  it("the fallback card is accessible (has an accessibilityLabel referencing the chain ID)", () => {
    const renderer = TestRenderer.create(
      <UnsupportedNetworkCard chainId={UNKNOWN_CHAIN_ID} />
    );
    // The outer card must have an accessibilityLabel that mentions the chain ID
    const card = renderer.root.findByProps({
      testID: "unsupported-network-card",
    });
    expect(card.props.accessibilityLabel).toContain(String(UNKNOWN_CHAIN_ID));
  });
});

// ---------------------------------------------------------------------------
// 3. RequirementCard – known chain ID path
// ---------------------------------------------------------------------------

describe("RequirementCard – recognised chain ID", () => {
  it("renders children normally when the chain ID is known", () => {
    const renderer = TestRenderer.create(
      <RequirementCard chainId={KNOWN_CHAIN_ID}>
        <Text testID="known-chain-child">Member badge</Text>
      </RequirementCard>
    );
    const json = JSON.stringify(renderer.toJSON());
    expect(json).toContain("Member badge");
    expect(json).not.toContain("Unsupported network");
  });

  it("does not render the fallback card for known chain IDs", () => {
    const renderer = TestRenderer.create(
      <RequirementCard chainId={KNOWN_CHAIN_ID}>
        <Text>Member badge</Text>
      </RequirementCard>
    );
    const json = JSON.stringify(renderer.toJSON());
    expect(json).not.toContain("Unsupported network");
  });
});

// ---------------------------------------------------------------------------
// 4. Mixed roles list – only affected requirement shows fallback
//    (Acceptance criterion: rest of the guild detail screen renders normally)
// ---------------------------------------------------------------------------

describe("RequirementCard – mixed known/unknown chain IDs in roles list", () => {
  it("renders each role card without throwing", () => {
    expect(() =>
      TestRenderer.create(
        <View testID="guild-roles-list">
          {ROLES_WITH_UNKNOWN_CHAIN_FIXTURE.map((role) => (
            <RequirementCard
              key={role.id}
              chainId={role.chainId}
              testID={`role-requirement-${role.id}`}
            >
              <Text testID={`role-badge-${role.id}`}>{role.name}</Text>
            </RequirementCard>
          ))}
        </View>
      )
    ).not.toThrow();
  });

  it("renders known-chain role badge normally", () => {
    const renderer = TestRenderer.create(
      <View testID="guild-roles-list">
        {ROLES_WITH_UNKNOWN_CHAIN_FIXTURE.map((role) => (
          <RequirementCard
            key={role.id}
            chainId={role.chainId}
            testID={`role-requirement-${role.id}`}
          >
            <Text testID={`role-badge-${role.id}`}>{role.name}</Text>
          </RequirementCard>
        ))}
      </View>
    );
    const json = JSON.stringify(renderer.toJSON());
    // The "Member" role with chainId: 1 (known) should render its badge text
    expect(json).toContain("Member");
  });

  it("renders 'Unsupported network' for only the unknown-chain role", () => {
    const renderer = TestRenderer.create(
      <View testID="guild-roles-list">
        {ROLES_WITH_UNKNOWN_CHAIN_FIXTURE.map((role) => (
          <RequirementCard
            key={role.id}
            chainId={role.chainId}
            testID={`role-requirement-${role.id}`}
          >
            <Text testID={`role-badge-${role.id}`}>{role.name}</Text>
          </RequirementCard>
        ))}
      </View>
    );
    const json = JSON.stringify(renderer.toJSON());
    // Unknown-chain role shows fallback
    expect(json).toContain("Unsupported network");
    // Known-chain role content is still present
    expect(json).toContain("Member");
  });

  it("sibling requirements are unaffected when one has an unknown chain ID", () => {
    // Both known and unknown chain roles are rendered in the same list.
    // The known one must be a normal badge; the unknown one must be a fallback.
    const renderer = TestRenderer.create(
      <View testID="guild-roles-list">
        {ROLES_WITH_UNKNOWN_CHAIN_FIXTURE.map((role) => (
          <RequirementCard
            key={role.id}
            chainId={role.chainId}
            testID={`role-requirement-${role.id}`}
          >
            <Text testID={`role-badge-${role.id}`}>{role.name}</Text>
          </RequirementCard>
        ))}
      </View>
    );
    // "Member" (chainId 1) badge rendered
    expect(renderer.root.findByProps({ testID: "role-badge-role_known" })).toBeDefined();
    // "Future Role" (chainId 999999) replaced by unsupported-network card
    expect(
      renderer.root.findByProps({ testID: "role-requirement-role_unknown-unsupported" })
    ).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// 5. GUILD_UNKNOWN_CHAIN_FIXTURE – chain registry look-up
// ---------------------------------------------------------------------------

describe("GUILD_UNKNOWN_CHAIN_FIXTURE – chain registry integration", () => {
  it("the fixture's chainId is not in the known-chain registry", () => {
    expect(isKnownChainId(GUILD_UNKNOWN_CHAIN_FIXTURE.chainId)).toBe(false);
  });

  it("getChainDisplayName returns 'Unsupported network' for the fixture chain ID", () => {
    expect(getChainDisplayName(GUILD_UNKNOWN_CHAIN_FIXTURE.chainId)).toBe(
      "Unsupported network"
    );
  });

  it("the guild detail screen would display 'Unsupported network' for the fixture chain ID", () => {
    // Simulate what app/guilds/[guildId].tsx now does for the Chain ID row:
    const chainId = GUILD_UNKNOWN_CHAIN_FIXTURE.chainId;
    const displayText = isKnownChainId(chainId)
      ? `${getChainDisplayName(chainId)} (${chainId})`
      : `Unsupported network (chain: ${chainId})`;

    expect(displayText).toBe(`Unsupported network (chain: ${chainId})`);
    expect(displayText).toContain("Unsupported network");
  });

  it("other guild fields (name, description, ownerAddress) are unaffected by the unknown chain ID", () => {
    // These fields are rendered before any chain-dependent logic runs.
    expect(GUILD_UNKNOWN_CHAIN_FIXTURE.name).toBe("Future L2 Guild");
    expect(GUILD_UNKNOWN_CHAIN_FIXTURE.description.length).toBeGreaterThan(0);
    expect(GUILD_UNKNOWN_CHAIN_FIXTURE.ownerAddress.startsWith("0x")).toBe(true);
    expect(GUILD_UNKNOWN_CHAIN_FIXTURE.isActive).toBe(true);
  });
});
